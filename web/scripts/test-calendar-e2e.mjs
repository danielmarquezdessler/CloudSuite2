import { mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
const runPortSeed = Number(
  process.env.CALENDAR_E2E_PORT_SEED ?? process.pid % 1000,
);
const apiPort = 12000 + runPortSeed;
const webPort = 13000 + runPortSeed;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  "C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const waitFor = async (url, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* startup */
    }
    await wait(300);
  }
  throw new Error(`${label} no inició.`);
};

let api;
let vite;
let browser;
let page;
let cleanup = async () => {};
try {
  const env = parseEnv(
    await readFile(new URL("../.env.test", import.meta.url), "utf8"),
  );
  await mkdir(resolve(webDir, ".screenshots"), { recursive: true });
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
        PORT: String(apiPort),
        PROJECT_ID: "politicfy-cloudsuite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  api.stderr.on("data", (chunk) => console.error(`[api] ${chunk}`));
  await waitFor(`${apiUrl}/health`, "API de calendario");
  vite = spawn(
    process.execPath,
    [
      resolve(webDir, "node_modules", "vite", "bin", "vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    {
      cwd: webDir,
      env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  vite.stderr.on("data", (chunk) => console.error(`[vite] ${chunk}`));
  vite.on("exit", (code) => console.error(`[vite] exited ${code}`));
  await waitFor(webUrl, "Vite de calendario");
  const { adminAuth, db } = await import(
    "../../server/dist/config/firebase.js"
  );
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection("users").doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campaignRef = db
    .collection("organizations")
    .doc(orgId)
    .collection("campaigns")
    .doc(env.E2E_CAMPAIGN_ID);
  if (!orgId || !env.E2E_CAMPAIGN_ID)
    throw new Error("No se pudo resolver organización/campaña E2E.");
  const created = [];
  const createdTasks = [];
  const createdResources = [];
  const createdTemplates = [];
  const createdTypeValues = [];
  const legacyEventId = `legacy-calendar-type-${Date.now()}`;
  const legacyTypeRef = campaignRef
    .collection("calendarEventTypes")
    .doc("legacy-meeting-e2e");
  const unusedLegacyTypeRef = campaignRef
    .collection("calendarEventTypes")
    .doc("legacy-legal-e2e");
  const [legacyTypeBefore, unusedLegacyTypeBefore] = await Promise.all([
    legacyTypeRef.get(),
    unusedLegacyTypeRef.get(),
  ]);
  await Promise.all([
    campaignRef
      .collection("calendar")
      .doc(legacyEventId)
      .set({
        title: "Evento legado E2E",
        type: "meeting",
        status: "confirmed",
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 90_000_000).toISOString(),
        participants: [],
        resourceIds: [],
        revision: 1,
      }),
    legacyTypeRef.set({ value: "meeting", label: "Reunión" }),
    unusedLegacyTypeRef.set({ value: "legal", label: "Jurídico" }),
  ]);
  cleanup = async () => {
    await Promise.all(
      created.map((id) => campaignRef.collection("calendar").doc(id).delete()),
    );
    await Promise.all(
      createdTasks.map((id) =>
        campaignRef.collection("tasks").doc(id).delete(),
      ),
    );
    await Promise.all(
      createdResources.map((id) =>
        campaignRef.collection("calendarResources").doc(id).delete(),
      ),
    );
    await Promise.all(
      createdTemplates.map((id) =>
        campaignRef.collection("calendarTemplates").doc(id).delete(),
      ),
    );
    await campaignRef.collection("calendar").doc(legacyEventId).delete();
    for (const [ref, snapshot] of [
      [legacyTypeRef, legacyTypeBefore],
      [unusedLegacyTypeRef, unusedLegacyTypeBefore],
    ]) {
      if (snapshot.exists) await ref.set(snapshot.data());
      else await ref.delete();
    }
    for (const value of createdTypeValues) {
      const matching = await campaignRef
        .collection("calendarEventTypes")
        .where("value", "==", value)
        .get();
      await Promise.all(matching.docs.map((document) => document.ref.delete()));
    }
  };
  browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath,
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(25_000);
  await page.goto(webUrl);
  await page.getByLabel("Email").fill(env.E2E_EMAIL);
  await page.getByLabel("Contraseña").fill(env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.goto(`${webUrl}/planning/calendar`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator(".cs-campaign-selector").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const selector = document.querySelector(".cs-campaign-selector");
    return Boolean(selector && !selector.hasAttribute("disabled"));
  });
  await page
    .getByRole("heading", { name: "Calendario Electoral", exact: true })
    .waitFor();
  const calendarHeader = page.locator(".electoral-calendar__header");
  if (
    (await calendarHeader.evaluate(
      (element) => getComputedStyle(element).padding,
    )) !== "15px"
  )
    throw new Error(
      "El padding efectivo del encabezado del calendario no es 15px.",
    );
  const expectedCampaignTypes = [
    "Lanzamiento de campaña",
    "Actos políticos y mítines",
    "Caminatas y recorridas territoriales (Timbreos)",
    "Debates electorales",
    "Conferencias de prensa",
    "Entrevistas en medios de comunicación",
    "Eventos de recaudación de fondos",
    "Reuniones con líderes comunitarios, sindicales o empresariales",
    "Visitas a instituciones, fábricas u ONGs",
    "Reuniones de estrategia con el equipo o comité de campaña",
    "Capacitación de voluntarios y fiscales de mesa",
    "Grabación de spots publicitarios y sesiones de fotos",
    "Mesas de difusión y entrega de volantes",
    "Actos de cierre de campaña",
    "Día de la elección (Votación del candidato y vigilia en el búnker)",
    "Otros",
  ];
  const seededTypes = await campaignRef.collection("calendarEventTypes").get();
  const seededValues = seededTypes.docs.map(
    (document) => document.data().value,
  );
  if (
    expectedCampaignTypes.length !== 16 ||
    !expectedCampaignTypes.every((label) =>
      seededTypes.docs.some((document) => document.data().label === label),
    ) ||
    !seededValues.includes("meeting") ||
    seededValues.includes("legal")
  )
    throw new Error(
      "El seed de tipos de campaña no conservó correctamente los tipos legados usados ni retiró los que no se usan.",
    );
  const actionLabels = await page.locator("button").allTextContents();
  if (!actionLabels.some((label) => label.includes("Crear evento")))
    throw new Error(
      `La agenda no presentó acciones de administración: ${actionLabels.filter(Boolean).join(" | ")}`,
    );
  await page.getByText("Evento legado E2E", { exact: true }).first().click();
  await page
    .getByRole("heading", { name: "Evento legado E2E", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Editar evento", exact: true })
    .click();
  const legacyTypeControl = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Tipo", exact: true });
  if ((await legacyTypeControl.inputValue()) !== "Reunión")
    throw new Error("Un evento legado perdió su tipo al abrirse para edición.");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  for (const label of [
    "Mes",
    "Semana",
    "Día",
    "Agenda",
    "Equipos",
    "Run of show",
  ])
    await page.getByRole("button", { name: label, exact: true }).waitFor();
  await page.getByRole("button", { name: /Operación/ }).click();
  await page.getByRole("dialog").waitFor();
  const resourceName = `Recurso E2E ${Date.now()}`;
  const templateName = `Plantilla E2E ${Date.now()}`;
  await page.getByLabel("Nombre del recurso").fill(resourceName);
  const resourceCreated = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/calendar/resources"),
  );
  await page
    .getByRole("button", { name: "Agregar recurso", exact: true })
    .click();
  const resourceResponse = await resourceCreated;
  if (resourceResponse.status() !== 201)
    throw new Error("No se creó el recurso operativo.");
  const resource = await resourceResponse.json();
  createdResources.push(resource.id);
  if (
    !(await campaignRef.collection("calendarResources").doc(resource.id).get())
      .exists
  )
    throw new Error("El recurso operativo no persistió en Firestore.");
  await page.getByLabel("Nombre de plantilla").fill(templateName);
  await page.getByLabel("Título sugerido").fill("Actividad desde plantilla");
  const templateCreated = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/calendar/templates"),
  );
  await page
    .getByRole("button", { name: "Agregar plantilla", exact: true })
    .click();
  const templateResponse = await templateCreated;
  if (templateResponse.status() !== 201)
    throw new Error("No se creó la plantilla operativa.");
  const template = await templateResponse.json();
  createdTemplates.push(template.id);
  if (
    !(await campaignRef.collection("calendarTemplates").doc(template.id).get())
      .exists
  )
    throw new Error("La plantilla operativa no persistió en Firestore.");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  const title = `E2E calendario ${Date.now()}`;
  const customType = `Operativo E2E ${Date.now()}`;
  await page.getByRole("button", { name: /Crear evento/ }).click();
  const eventDialog = page.getByRole("dialog");
  await eventDialog.waitFor();
  await eventDialog.getByLabel("Título").fill(title);
  const typeControl = eventDialog.getByRole("combobox", {
    name: "Tipo",
    exact: true,
  });
  if (await eventDialog.locator("datalist").count())
    throw new Error("Tipo todavía usa datalist en vez de un combobox.");
  await typeControl.click();
  await page.locator("[data-dropdown-portal]").waitFor({ state: "visible" });
  const defaultOptions = await page
    .locator('[data-dropdown-portal] [role="option"]')
    .allTextContents();
  if (!expectedCampaignTypes.every((label) => defaultOptions.includes(label)))
    throw new Error(
      `El combobox no presentó los 16 tipos de campaña: ${defaultOptions.join(" | ")}`,
    );
  await eventDialog.screenshot({
    path: resolve(webDir, ".screenshots", "calendar-type-combobox.png"),
  });
  await page.setViewportSize({ width: 375, height: 844 });
  const mobileTypeBox = await typeControl.boundingBox();
  if (
    !mobileTypeBox ||
    mobileTypeBox.width < 44 ||
    (await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ))
  )
    throw new Error("El selector de tipo no es usable en viewport móvil.");
  await page.setViewportSize({ width: 1440, height: 980 });
  await page
    .getByRole("option", { name: "Actos políticos y mítines", exact: true })
    .click();
  if ((await typeControl.inputValue()) !== "Actos políticos y mítines")
    throw new Error("Elegir un tipo existente no actualizó el evento.");
  await typeControl.click();
  await typeControl.fill(customType);
  const customTypeCreated = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/calendar/types"),
  );
  await page
    .getByRole("button", { name: `Crear tipo “${customType}”`, exact: true })
    .click();
  if ((await customTypeCreated).status() !== 201)
    throw new Error("El tipo personalizado no se persistió al seleccionarlo.");
  await typeControl.waitFor({ state: "visible" });
  if ((await typeControl.inputValue()) !== customType)
    throw new Error("El tipo personalizado no quedó seleccionado.");
  createdTypeValues.push(customType);
  const publicationToggle = eventDialog
    .locator("label.form-check")
    .filter({ hasText: "Publicación" })
    .locator('input[type="checkbox"]');
  await publicationToggle.check();
  await eventDialog
    .getByText("Permitir edición a usuarios vinculados", { exact: true })
    .waitFor();
  const firstLinkedMember = eventDialog
    .locator(".electoral-calendar__modal-section")
    .first()
    .locator('.electoral-calendar__checkbox-grid input[type="checkbox"]')
    .first();
  if (await firstLinkedMember.count()) await firstLinkedMember.check();
  const creation = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/calendar"),
  );
  await page
    .getByRole("button", { name: "Guardar evento", exact: true })
    .click();
  const result = await creation;
  if (result.status() !== 201)
    throw new Error(`Creación de evento respondió ${result.status()}.`);
  const createdEvent = await result.json();
  created.push(createdEvent.eventId);
  const stored = await campaignRef
    .collection("calendar")
    .doc(createdEvent.eventId)
    .get();
  const taskId = `calendar-publication-${createdEvent.eventId}`;
  createdTasks.push(taskId);
  if (
    !stored.exists ||
    !stored.data()?.startAt ||
    !stored.data()?.endAt ||
    stored.data()?.revision !== 1 ||
    stored.data()?.type !== customType ||
    stored.data()?.isPublication !== true ||
    !(await campaignRef.collection("tasks").doc(taskId).get()).exists
  )
    throw new Error(
      "El evento de publicación o su tarea espejo no se persistieron con los datos esperados en Firestore.",
    );
  await page.getByText(title, { exact: false }).first().click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.getByText("Exportar ICS", { exact: true }).waitFor();
  await page.getByText("Publicación", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await page.locator(".fc-timegrid").waitFor();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.locator(".fc-list").waitFor();
  await page
    .getByRole("button", { name: "Editar evento", exact: true })
    .click();
  const editTypeControl = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Tipo", exact: true });
  if ((await editTypeControl.inputValue()) !== customType)
    throw new Error(
      "El tipo personalizado no quedó disponible al editar el evento.",
    );
  await editTypeControl.click();
  await page.getByRole("option", { name: customType, exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByLabel("Título").fill(`${title} actualizado`);
  const update = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith(`/calendar/${createdEvent.eventId}`),
  );
  await page
    .getByRole("button", { name: "Guardar evento", exact: true })
    .click();
  if (!(await update).ok())
    throw new Error("La edición no se guardó por la API.");
  await page.getByTestId("calendar-find-availability").waitFor();
  const updated = await campaignRef
    .collection("calendar")
    .doc(createdEvent.eventId)
    .get();
  if (
    updated.data()?.title !== `${title} actualizado` ||
    updated.data()?.revision !== 2
  )
    throw new Error("La edición no aplicó control de revisión en Firestore.");
  await page.getByRole("button", { name: "Editar evento", exact: true }).click();
  await page.getByLabel("Título").fill(`${title} actualizado otra vez`);
  const repeatedUpdate = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith(`/calendar/${createdEvent.eventId}`),
  );
  await page.getByRole("button", { name: "Guardar evento", exact: true }).click();
  if (!(await repeatedUpdate).ok())
    throw new Error("La segunda edición no se guardó por la API.");
  const repeated = await campaignRef
    .collection("calendar")
    .doc(createdEvent.eventId)
    .get();
  if (
    repeated.data()?.title !== `${title} actualizado otra vez` ||
    repeated.data()?.revision !== 3
  )
    throw new Error(
      "La segunda edición usó una revisión obsoleta o no persistió en Firestore.",
    );
  await page.getByTestId("calendar-find-availability").click();
  await page.getByRole("dialog").waitFor();
  const availabilityPerson = page
    .locator('.modal .electoral-calendar__checkbox-grid input[type="checkbox"]')
    .first();
  if (await availabilityPerson.count()) {
    await availabilityPerson.check();
    const availabilityResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/calendar/availability"),
    );
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    if (!(await availabilityResponse).ok())
      throw new Error(
        "La consulta de disponibilidad no respondió correctamente.",
      );
    await page
      .getByText(/Ocupado:|Sin bloqueos en el alcance consultado/)
      .waitFor();
  }
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  console.log(
    "CALENDAR E2E: agenda, vistas, recursos, plantillas, disponibilidad, creación, edición, exportación y tipo personalizado persistido en Firestore OK.",
  );
} finally {
  await cleanup();
  await browser?.close();
  vite?.kill();
  api?.kill();
}
