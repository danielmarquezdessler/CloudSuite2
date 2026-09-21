import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = fileURLToPath(new URL("../", import.meta.url));
const serverDir = fileURLToPath(new URL("../../server/", import.meta.url));
const parseEnv = (source) =>
  Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1),
      ]),
  );
const wait = (milliseconds) =>
  new Promise((done) => setTimeout(done, milliseconds));
const seed = Number(
  process.env.CALENDAR_PUBLICATION_E2E_SEED ?? process.pid % 1000,
);
const port = 14000 + seed;
const apiUrl = `http://127.0.0.1:${port}`;
const waitFor = async (url) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* startup */
    }
    await wait(300);
  }
  throw new Error("La API de publicación no inició.");
};
const json = async (response) => ({
  response,
  body: await response.json().catch(() => null),
});
const request = async (token, path, init = {}) =>
  json(
    await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(init.headers ?? {}),
      },
    }),
  );

let api;
let cleanup = async () => {};
try {
  const testEnv = parseEnv(
    await readFile(new URL("../.env.test", import.meta.url), "utf8"),
  );
  const webEnv = parseEnv(
    await readFile(new URL("../.env", import.meta.url), "utf8"),
  );
  api = spawn(
    process.execPath,
    [
      resolve(serverDir, "node_modules", "tsx", "dist", "cli.mjs"),
      "src/index.ts",
    ],
    {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: String(port),
        PROJECT_ID: "politicfy-cloudsuite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  api.stderr.on("data", (chunk) => console.error(`[api] ${chunk}`));
  await waitFor(`${apiUrl}/health`);
  const { adminAuth, db, storage } = await import(
    "../../server/dist/config/firebase.js"
  );
  const ownerSignIn = await json(
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.VITE_FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEnv.E2E_EMAIL,
          password: testEnv.E2E_PASSWORD,
          returnSecureToken: true,
        }),
      },
    ),
  );
  if (!ownerSignIn.response.ok || !ownerSignIn.body?.idToken)
    throw new Error(
      `No se pudo autenticar el dueño E2E: ${ownerSignIn.body?.error?.message ?? ownerSignIn.response.status}`,
    );
  const ownerToken = ownerSignIn.body.idToken;
  const owner = await adminAuth.getUserByEmail(testEnv.E2E_EMAIL);
  const ownerProfile = await db.collection("users").doc(owner.uid).get();
  const orgId = testEnv.E2E_ORG_ID || ownerProfile.data()?.orgIds?.[0];
  const campId = testEnv.E2E_CAMPAIGN_ID;
  if (!orgId || !campId)
    throw new Error("No se pudo resolver organización/campaña E2E.");
  const base = `/api/organizations/${orgId}/campaigns/${campId}`;
  const campaign = db
    .collection("organizations")
    .doc(orgId)
    .collection("campaigns")
    .doc(campId);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `calendar-publication-${suffix}@cloudsuite.local`;
  const collaboratorPassword = `Calendar-E2E-${suffix}!`;
  const collaborator = await adminAuth.createUser({
    email,
    password: collaboratorPassword,
    displayName: "Colaborador de Publicación E2E",
  });
  const eventIds = [];
  const taskIds = [];
  const storagePaths = [];
  cleanup = async () => {
    const notificationDocs = await db
      .collection("users")
      .doc(collaborator.uid)
      .collection("notifications")
      .get();
    await Promise.all(notificationDocs.docs.map((document) => document.ref.delete()));
    await Promise.all(
      storagePaths.map((path) =>
        storage.bucket().file(path).delete({ ignoreNotFound: true }),
      ),
    );
    await Promise.all(
      eventIds.map((id) => campaign.collection("calendar").doc(id).delete()),
    );
    await Promise.all(
      taskIds.map((id) => campaign.collection("tasks").doc(id).delete()),
    );
    await Promise.all([
      db.collection("users").doc(collaborator.uid).delete(),
      db
        .collection("organizations")
        .doc(orgId)
        .collection("members")
        .doc(collaborator.uid)
        .delete(),
      campaign.collection("members").doc(collaborator.uid).delete(),
      adminAuth.deleteUser(collaborator.uid),
    ]);
  };
  const claims = { orgId, role: "usuario", camps: { [campId]: true } };
  await adminAuth.setCustomUserClaims(collaborator.uid, claims);
  await Promise.all([
    db
      .collection("users")
      .doc(collaborator.uid)
      .set({
        email,
        displayName: collaborator.displayName,
        orgIds: [orgId],
        photoURL: "https://example.com/e2e-avatar.png",
      }),
    db
      .collection("organizations")
      .doc(orgId)
      .collection("members")
      .doc(collaborator.uid)
      .set({ role: "usuario", createdAt: new Date() }),
    campaign
      .collection("members")
      .doc(collaborator.uid)
      .set({
        email,
        displayName: collaborator.displayName,
        role: "usuario",
        joinedAt: new Date(),
        smartPlannerRole: "contador",
      }),
  ]);
  const collaboratorSignIn = await json(
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.VITE_FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: collaboratorPassword,
          returnSecureToken: true,
        }),
      },
    ),
  );
  if (!collaboratorSignIn.response.ok || !collaboratorSignIn.body?.idToken)
    throw new Error("No se pudo autenticar al colaborador E2E.");
  const collaboratorToken = collaboratorSignIn.body.idToken;

  for (const path of [
    `/api/organizations/${orgId}/users`,
    `${base}/members`,
    `${base}/teams`,
    `${base}/candidates`,
    `${base}/calendar/types`,
  ]) {
    const result = await request(collaboratorToken, path);
    if (!result.response.ok)
      throw new Error(
        `El colaborador recibió ${result.response.status} al leer ${path}.`,
      );
  }
  const ownProfile = await request(collaboratorToken, "/api/me");
  if (
    !ownProfile.response.ok ||
    ownProfile.body?.profile?.photoURL !== "https://example.com/e2e-avatar.png"
  )
    throw new Error("El perfil del colaborador no devolvió su avatar propio.");
  const smartPlannerMembers = await request(
    collaboratorToken,
    `${base}/smartplanner/members`,
  );
  if (
    !smartPlannerMembers.response.ok ||
    smartPlannerMembers.body?.find((member) => member.uid === collaborator.uid)
      ?.smartPlannerRole !== "contador"
  )
    throw new Error(
      "Roles SmartPlanner no devolvió el rol asignado del colaborador.",
    );
  const visibleType = `Tipo colaborador ${suffix}`;
  const createdByCollaborator = await request(
    collaboratorToken,
    `${base}/calendar`,
    {
      method: "POST",
      body: JSON.stringify({
        title: `Evento de colaborador ${suffix}`,
        type: visibleType,
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 90_000_000).toISOString(),
        participantIds: [],
        resourceIds: [],
        idempotencyKey: `collab-${suffix}`,
      }),
    },
  );
  if (createdByCollaborator.response.status !== 201)
    throw new Error(
      `El colaborador no pudo crear un evento: ${createdByCollaborator.response.status}.`,
    );
  eventIds.push(createdByCollaborator.body.eventId);
  const typesAfterCreate = await request(
    collaboratorToken,
    `${base}/calendar/types`,
  );
  if (!typesAfterCreate.body?.some((type) => type.value === visibleType))
    throw new Error(
      "El tipo personalizado del colaborador no persistió en el catálogo.",
    );

  const created = await request(ownerToken, `${base}/calendar`, {
    method: "POST",
    body: JSON.stringify({
      title: `Publicación E2E ${suffix}`,
      type: "communication",
      startAt: new Date(Date.now() + 172_800_000).toISOString(),
      endAt: new Date(Date.now() + 176_400_000).toISOString(),
      participantIds: [],
      resourceIds: [],
      isPublication: true,
      linkedUserIds: [collaborator.uid],
      allowLinkedEditing: true,
      idempotencyKey: `publication-${suffix}`,
    }),
  });
  if (created.response.status !== 201)
    throw new Error(`No se creó la publicación: ${created.response.status}.`);
  const eventId = created.body.eventId;
  const taskId = `calendar-publication-${eventId}`;
  eventIds.push(eventId);
  taskIds.push(taskId);
  const storedEvent = await campaign.collection("calendar").doc(eventId).get();
  const storedTask = await campaign.collection("tasks").doc(taskId).get();
  if (
    storedEvent.data()?.isPublication !== true ||
    storedEvent.data()?.linkedUserIds?.[0] !== collaborator.uid ||
    !storedTask.exists ||
    storedTask.data()?.sourceEventId !== eventId
  )
    throw new Error(
      "La publicación o su tarea espejo no persistieron correctamente.",
    );
  const notifications = await request(
    collaboratorToken,
    `/api/users/${collaborator.uid}/notifications`,
  );
  if (
    !notifications.response.ok ||
    !notifications.body?.some(
      (notification) =>
        notification.type === "calendar_publication_assigned" &&
        notification.metadata?.eventId === eventId &&
        notification.metadata?.orgId === orgId &&
        notification.metadata?.campId === campId,
    )
  )
    throw new Error(
      "El usuario vinculado no recibió la notificación de la publicación creada.",
    );
  const listAsCollaborator = await request(
    collaboratorToken,
    `${base}/calendar`,
  );
  const publicationDto = listAsCollaborator.body?.find(
    (item) => item.id === eventId,
  );
  if (!publicationDto?.canEdit)
    throw new Error(
      "El colaborador vinculado no recibió permiso de edición en el DTO de publicación.",
    );
  const editedTitle = `Publicación editada ${suffix}`;
  const editedStartAt = new Date(Date.now() + 259_200_000).toISOString();
  const edit = await request(collaboratorToken, `${base}/calendar/${eventId}`, {
    method: "PUT",
    body: JSON.stringify({
      title: editedTitle,
      startAt: editedStartAt,
      endAt: new Date(Date.parse(editedStartAt) + 3_600_000).toISOString(),
      status: "completed",
      expectedRevision: publicationDto.revision,
    }),
  });
  if (!edit.response.ok)
    throw new Error(
      `El colaborador vinculado no pudo editar: ${edit.response.status}.`,
    );
  const repeatedTitle = `Publicación editada nuevamente ${suffix}`;
  const repeatedEdit = await request(
    collaboratorToken,
    `${base}/calendar/${eventId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        title: repeatedTitle,
        expectedRevision: edit.body.revision,
      }),
    },
  );
  if (!repeatedEdit.response.ok)
    throw new Error(
      `El colaborador vinculado no pudo volver a editar: ${repeatedEdit.response.status}.`,
    );
  const mirroredTask = await campaign.collection("tasks").doc(taskId).get();
  if (
    mirroredTask.data()?.title !== repeatedTitle ||
    mirroredTask.data()?.dueDate !== editedStartAt.slice(0, 10) ||
    mirroredTask.data()?.status !== "completada" ||
    mirroredTask.data()?.linkedUserIds?.[0] !== collaborator.uid
  )
    throw new Error(
      "La edición de la publicación no se reflejó por completo en la tarea espejo.",
    );
  const storedAfterRepeatedEdit = await campaign.collection("calendar").doc(eventId).get();
  if (
    storedAfterRepeatedEdit.data()?.revision !== repeatedEdit.body.revision ||
    storedAfterRepeatedEdit.data()?.linkedUserIds?.[0] !== collaborator.uid ||
    storedAfterRepeatedEdit.data()?.allowLinkedEditing !== true
  )
    throw new Error(
      "La segunda edición no preservó el vínculo ni la autorización de la publicación.",
    );
  const attachmentBody = new FormData();
  attachmentBody.append(
    "attachment",
    new Blob(["comprobante de publicación E2E"], { type: "text/plain" }),
    "publicacion-e2e.txt",
  );
  const attachment = await request(
    collaboratorToken,
    `${base}/calendar/${eventId}/attachments`,
    { method: "POST", body: attachmentBody },
  );
  if (
    attachment.response.status !== 201 ||
    !attachment.body?.storagePath ||
    !(await storage.bucket().file(attachment.body.storagePath).exists())[0]
  )
    throw new Error("El adjunto del colaborador no quedó aislado en Storage.");
  storagePaths.push(attachment.body.storagePath);
  const revisionAfterAttachment = (
    await campaign.collection("calendar").doc(eventId).get()
  ).data()?.revision;
  const disable = await request(ownerToken, `${base}/calendar/${eventId}`, {
    method: "PUT",
    body: JSON.stringify({
      allowLinkedEditing: false,
      expectedRevision: revisionAfterAttachment,
    }),
  });
  if (!disable.response.ok)
    throw new Error("El admin no pudo deshabilitar la edición del vinculado.");
  const forbidden = await request(
    collaboratorToken,
    `${base}/calendar/${eventId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        title: "No debe guardar",
        expectedRevision: disable.body.revision,
      }),
    },
  );
  if (forbidden.response.status !== 403)
    throw new Error(
      `La edición sin permiso debía responder 403 y respondió ${forbidden.response.status}.`,
    );
  const forbiddenUpload = new FormData();
  forbiddenUpload.append(
    "attachment",
    new Blob(["denegado"], { type: "text/plain" }),
    "denegado.txt",
  );
  const attachmentForbidden = await request(
    collaboratorToken,
    `${base}/calendar/${eventId}/attachments`,
    { method: "POST", body: forbiddenUpload },
  );
  if (attachmentForbidden.response.status !== 403)
    throw new Error(
      `El adjunto sin edición debía responder 403 y respondió ${attachmentForbidden.response.status}.`,
    );
  console.log(
    "CALENDAR PUBLICATION E2E: notificación al vinculado, dos ediciones consecutivas, tarea espejo, adjunto Storage y 403 al deshabilitar edición OK.",
  );
} finally {
  await cleanup();
  api?.kill();
}
