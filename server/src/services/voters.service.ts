import { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import {
  assertCampaignAccess,
  assertCampaignManager,
  campaignRef,
  ConflictError,
  ValidationError,
} from "./access.service.js";

type Row = Record<string, unknown>;
const value = (row: Row, names: string[]) => {
  const key = Object.keys(row).find((key) =>
    names.includes(key.trim().toLowerCase()),
  );
  return String(key ? (row[key] ?? "") : "").trim();
};
export const normalizeVoterText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const norm = normalizeVoterText;
/** Normalizes common Argentine street abbreviations before duplicate comparison. */
export const normalizeVoterAddress = (address: string) =>
  norm(address)
    .replace(/\bav\.?(?=\s|$)/g, "avenida")
    .replace(/\bbv\.?(?=\s|$)/g, "boulevard")
    .replace(/\bbulevar\b/g, "boulevard")
    .replace(/\bdr\.?\s*/g, "doctor ")
    .replace(/\bgral\.?\s*/g, "general ")
    .replace(/\bpto\.?\s*/g, "puerto ")
    .replace(/\bc\.?(?=\s|$)/g, "calle")
    .replace(/[,.#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const householdForAddress = (address: string) =>
  `household_${createHash("sha256").update(norm(address)).digest("hex").slice(0, 16)}`;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function geocode(address: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`,
  );
  const data = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };
  if (!response.ok || data.status !== "OK" || !data.results?.[0]) return null;
  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}
function parseFile(file: Express.Multer.File) {
  const isCsv = /\.csv$/i.test(file.originalname);
  const workbook = isCsv
    ? XLSX.read(file.buffer.toString("utf8"), { type: "string" })
    : XLSX.read(file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
}
export async function importVoters(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  file: Express.Multer.File | undefined,
  allowNearDuplicates: boolean,
) {
  assertCampaignManager(user, orgId, campId);
  if (!file) throw new ValidationError("Seleccioná un archivo CSV o Excel.");
  const rows = parseFile(file);
  const ref = campaignRef(orgId, campId);
  const existing = await ref.collection("voters").get();
  const known = new Set(
    existing.docs.map(
      (doc) =>
        `${norm(String(doc.data().name ?? ""))}|${norm(String(doc.data().address ?? ""))}`,
    ),
  );
  const errorRows: { rowNum: number; error: string }[] = [];
  const voters: Array<Record<string, unknown>> = [];
  let duplicateCount = 0;
  let noGeoCount = 0;
  let nearDuplicateCount = 0;
  const coordinates = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const name = value(row, ["nombre", "name"]);
    const address = value(row, [
      "direccion",
      "dirección",
      "direcciã³n",
      "address",
    ]);
    if (!name || !address) {
      errorRows.push({
        rowNum: index + 2,
        error: "Nombre y Dirección son obligatorios.",
      });
      continue;
    }
    const key = `${norm(name)}|${norm(address)}`;
    if (known.has(key)) {
      duplicateCount++;
      continue;
    }
    known.add(key);
    const geo = await geocode(address);
    if (geo) {
      const coordinate = `${geo.lat.toFixed(6)},${geo.lng.toFixed(6)}`;
      if (coordinates.has(coordinate)) {
        nearDuplicateCount++;
        if (!allowNearDuplicates) {
          duplicateCount++;
          continue;
        }
      }
      coordinates.add(coordinate);
    } else {
      noGeoCount++;
      console.warn(`[CloudSuite] No se pudo geocodificar: ${address}`);
    }
    voters.push({
      id: value(row, ["id"]) || ref.collection("voters").doc().id,
      name,
      address: geo?.formattedAddress ?? address,
      phone: value(row, ["telefono", "teléfono", "telã©fono", "phone"]) || null,
      email: value(row, ["email"]) || null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      state: "unvisited",
      visitedAt: null,
      lastVisitUid: null,
      feedback: null,
      conversions: { yes: 0, no: 0, undecided: 0, last_decision: null },
      createdAt: FieldValue.serverTimestamp(),
    });
    await delay(20);
  }
  if (voters.length > 450)
    throw new ValidationError(
      "El MVP admite hasta 450 electores por importación para garantizar una escritura atómica.",
    );
  // Only the bundled/demo files get seed activity, so real campaign imports remain untouched.
  const isDemo = /(?:ejemplo|sample|demo|test)/i.test(file.originalname);
  const seededVisits = isDemo
    ? voters
        .slice(0, 10)
        .map((voter, index) => ({
          voter,
          decision: ["yes", "no", "undecided"][index % 3],
          when: new Date(Date.now() - (index % 7) * 86400000),
        }))
    : [];
  seededVisits.forEach(({ voter, decision, when }) => {
    const state =
      decision === "yes"
        ? "converted_yes"
        : decision === "no"
          ? "converted_no"
          : "undecided";
    Object.assign(voter, {
      state,
      visitedAt: when,
      lastVisitUid: user.uid,
      conversions: {
        yes: decision === "yes" ? 1 : 0,
        no: decision === "no" ? 1 : 0,
        undecided: decision === "undecided" ? 1 : 0,
        last_decision: decision,
      },
    });
  });
  const batch = ref.firestore.batch();
  voters.forEach((voter) =>
    batch.set(ref.collection("voters").doc(String(voter.id)), voter),
  );
  seededVisits.forEach(({ voter, decision, when }) =>
    batch.set(ref.collection("visits").doc(), {
      voterId: voter.id,
      visitUid: user.uid,
      startedAt: when,
      completedAt: when,
      state: decision === "undecided" ? "pending_revisit" : "completed",
      conversion: { decision, timestamp: when },
      feedback: { seeded: true },
    }),
  );
  const importRef = ref.collection("imports").doc();
  const report = {
    importedCount: voters.length,
    duplicateCount,
    noGeoCount,
    nearDuplicateCount,
    seededVisits: seededVisits.length,
    errorRows,
    totalProcessedRows: rows.length,
  };
  batch.set(importRef, {
    status: "completed",
    timestamp: FieldValue.serverTimestamp(),
    counts: report,
    errorRows,
    file: file.originalname,
  });
  await batch.commit();
  return report;
}
type CreateVoterInput = {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  email?: unknown;
  lat?: unknown;
  lng?: unknown;
  dni?: unknown;
  sexo?: unknown;
  fechaNacimiento?: unknown;
  edadAproximada?: unknown;
  barrio?: unknown;
  observaciones?: unknown;
  tags?: unknown;
  householdId?: unknown;
  confirmSimilar?: unknown;
};
const textInput = (input: unknown) =>
  typeof input === "string" ? input.trim() : "";
const normalizeTags = (input: unknown) =>
  Array.isArray(input)
    ? [
        ...new Map(
          input
            .map((tag) => textInput(tag))
            .filter(Boolean)
            .slice(0, 30)
            .map((tag) => [norm(tag), tag]),
        ).values(),
      ]
    : [];
const optionalText = (input: unknown, label: string, maxLength: number) => {
  const text = textInput(input);
  if (text.length > maxLength)
    throw new ValidationError(
      `${label} no puede superar los ${maxLength} caracteres.`,
    );
  return text || null;
};
const optionalSexo = (input: unknown) => {
  const sexo = textInput(input);
  if (!sexo) return null;
  if (!["M", "F", "X", "Prefiero no decir"].includes(sexo))
    throw new ValidationError("El sexo seleccionado no es válido.");
  return sexo;
};
const optionalBirthDate = (input: unknown) => {
  const date = textInput(input);
  if (!date) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(new Date(`${date}T00:00:00`).getTime())
  )
    throw new ValidationError("La fecha de nacimiento no es válida.");
  return date;
};
const optionalApproximateAge = (input: unknown) => {
  if (input === undefined || input === null || input === "") return null;
  const age = Number(input);
  if (!Number.isInteger(age) || age < 0 || age > 130)
    throw new ValidationError(
      "La edad aproximada debe ser un número entre 0 y 130.",
    );
  return age;
};
const coordinatesFromInput = (input: CreateVoterInput) => {
  const hasLat =
    input.lat !== undefined && input.lat !== null && input.lat !== "";
  const hasLng =
    input.lng !== undefined && input.lng !== null && input.lng !== "";
  if (!hasLat && !hasLng) return { lat: null, lng: null };
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (
    !hasLat ||
    !hasLng ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  )
    throw new ValidationError("Las coordenadas del elector no son válidas.");
  return { lat, lng };
};

/** Creates one voter whose coordinates were selected by Google Places in the browser. */
export async function createVoter(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  input: CreateVoterInput,
) {
  assertCampaignManager(user, orgId, campId);
  const name = textInput(input.name);
  const address = textInput(input.address);
  const phone = textInput(input.phone);
  const email = textInput(input.email);
  if (!name || !address)
    throw new ValidationError("Nombre y dirección son obligatorios.");
  const { lat, lng } = coordinatesFromInput(input);
  const fechaNacimiento = optionalBirthDate(input.fechaNacimiento);
  const edadAproximada = optionalApproximateAge(input.edadAproximada);
  if (fechaNacimiento && edadAproximada !== null)
    throw new ValidationError(
      "Ingresá fecha de nacimiento o edad aproximada, no ambas.",
    );

  const ref = campaignRef(orgId, campId);
  const duplicateKey = `${norm(name)}|${norm(address)}`;
  const existing = await ref.collection("voters").get();
  const similar = existing.docs.find(
    (doc) =>
      `${norm(String(doc.data().name ?? ""))}|${norm(String(doc.data().address ?? ""))}` ===
      duplicateKey,
  );
  if (similar && input.confirmSimilar !== true)
    throw new ConflictError(
      `Ya existe un elector similar: ${String(similar.data().name ?? "Elector")}. ¿Confirmás que es una persona distinta?`,
      {
        similarVoter: {
          id: similar.id,
          name: String(similar.data().name ?? ""),
          address: String(similar.data().address ?? ""),
        },
      },
    );

  const voterRef = ref.collection("voters").doc();
  const sameAddress = existing.docs.filter(
    (doc) => norm(String(doc.data().address ?? "")) === norm(address),
  );
  const manualHouseholdId = textInput(input.householdId);
  const householdId =
    manualHouseholdId ||
    (sameAddress.length ? householdForAddress(address) : null);
  const voter = {
    name,
    address,
    phone: phone || null,
    email: email || null,
    dni: optionalText(input.dni, "El DNI", 32),
    sexo: optionalSexo(input.sexo),
    fechaNacimiento,
    edadAproximada,
    barrio: optionalText(input.barrio, "El barrio", 120),
    observaciones: optionalText(input.observaciones, "Las observaciones", 4000),
    lat,
    lng,
    tags: normalizeTags(input.tags),
    householdId,
    state: "unvisited",
    visitedAt: null,
    lastVisitUid: null,
    feedback: null,
    conversions: { yes: 0, no: 0, undecided: 0, last_decision: null },
    createdAt: FieldValue.serverTimestamp(),
  };
  const batch = ref.firestore.batch();
  batch.set(voterRef, voter);
  if (sameAddress.length && !manualHouseholdId)
    sameAddress.forEach((doc) => batch.update(doc.ref, { householdId }));
  await batch.commit();
  return { id: voterRef.id, ...voter, createdAt: null };
}
type UpdateVoterInput = CreateVoterInput & { tags?: unknown };

export async function updateVoter(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  voterId: string,
  input: UpdateVoterInput,
) {
  assertCampaignManager(user, orgId, campId);
  const voterRef = campaignRef(orgId, campId).collection("voters").doc(voterId);
  const snapshot = await voterRef.get();
  if (!snapshot.exists) throw new ValidationError("El elector no existe.");
  const current = snapshot.data()!;
  const name = textInput(input.name) || String(current.name ?? "");
  const address = textInput(input.address) || String(current.address ?? "");
  if (!name || !address)
    throw new ValidationError("Nombre y dirección son obligatorios.");
  const coordinatesChanged = input.lat !== undefined || input.lng !== undefined;
  const coordinates = coordinatesChanged
    ? coordinatesFromInput(input)
    : { lat: current.lat ?? null, lng: current.lng ?? null };
  const fechaNacimiento =
    input.fechaNacimiento === undefined
      ? (current.fechaNacimiento ?? null)
      : optionalBirthDate(input.fechaNacimiento);
  const edadAproximada =
    input.edadAproximada === undefined
      ? (current.edadAproximada ?? null)
      : optionalApproximateAge(input.edadAproximada);
  if (fechaNacimiento && edadAproximada !== null)
    throw new ValidationError(
      "Ingresá fecha de nacimiento o edad aproximada, no ambas.",
    );
  const manualHouseholdId =
    input.householdId === undefined ? undefined : textInput(input.householdId);
  const data = {
    name,
    address,
    phone: textInput(input.phone) || null,
    email: textInput(input.email) || null,
    dni:
      input.dni === undefined
        ? (current.dni ?? null)
        : optionalText(input.dni, "El DNI", 32),
    sexo:
      input.sexo === undefined
        ? (current.sexo ?? null)
        : optionalSexo(input.sexo),
    fechaNacimiento,
    edadAproximada,
    barrio:
      input.barrio === undefined
        ? (current.barrio ?? null)
        : optionalText(input.barrio, "El barrio", 120),
    observaciones:
      input.observaciones === undefined
        ? (current.observaciones ?? null)
        : optionalText(input.observaciones, "Las observaciones", 4000),
    tags:
      input.tags === undefined
        ? Array.isArray(current.tags)
          ? current.tags
          : []
        : normalizeTags(input.tags),
    ...(coordinatesChanged ? coordinates : {}),
    ...(manualHouseholdId !== undefined
      ? { householdId: manualHouseholdId || null }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await voterRef.update(data);
  const previousTags = Array.isArray(current.tags)
    ? current.tags.map(String).sort()
    : [];
  const nextTags = Array.isArray(data.tags) ? data.tags.map(String).sort() : [];
  if (previousTags.join("|") !== nextTags.join("|"))
    await voterRef
      .collection("events")
      .doc()
      .set({
        type: "tags",
        title: "Tags actualizados",
        description: nextTags.length ? nextTags.join(", ") : "Sin tags",
        createdAt: FieldValue.serverTimestamp(),
        actorUid: user.uid,
        actorName: String(user.name ?? user.email ?? "Usuario"),
      });
  if (manualHouseholdId === undefined || !manualHouseholdId) {
    const matching = (
      await campaignRef(orgId, campId).collection("voters").get()
    ).docs.filter(
      (doc) => norm(String(doc.data().address ?? "")) === norm(address),
    );
    if (matching.length >= 2) {
      const householdId = householdForAddress(address);
      const batch = voterRef.firestore.batch();
      matching.forEach((doc) => batch.update(doc.ref, { householdId }));
      await batch.commit();
      Object.assign(data, { householdId });
    }
  }
  return { id: voterId, ...data, updatedAt: null };
}
const asIso = (value: unknown) =>
  value &&
  typeof value === "object" &&
  "toDate" in value &&
  typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : typeof value === "string"
      ? value
      : new Date().toISOString();
export async function voterProfile(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  voterId: string,
) {
  assertCampaignAccess(user, orgId, campId);
  const campaign = campaignRef(orgId, campId);
  const voterRef = campaign.collection("voters").doc(voterId);
  const voter = await voterRef.get();
  if (!voter.exists) throw new ValidationError("El elector no existe.");
  const voterData = voter.data()!;
  const [visits, notes, events, issueTypes, allVoters] = await Promise.all([
    campaign.collection("visits").where("voterId", "==", voterId).get(),
    voterRef.collection("notes").get(),
    voterRef.collection("events").get(),
    campaign.collection("issueTypes").get(),
    voterData.householdId
      ? campaign
          .collection("voters")
          .where("householdId", "==", voterData.householdId)
          .get()
      : Promise.resolve(null),
  ]);
  const authorIds = [
    ...new Set([
      ...visits.docs
        .map((item) => String(item.data().visitUid ?? ""))
        .filter(Boolean),
      ...notes.docs
        .map((item) => String(item.data().authorUid ?? ""))
        .filter(Boolean),
    ]),
  ];
  const authors = authorIds.length
    ? await Promise.all(
        authorIds.map((id) =>
          campaign.firestore.collection("users").doc(id).get(),
        ),
      )
    : [];
  const names = new Map(
    authors
      .filter((item) => item.exists)
      .map((item) => [
        item.id,
        String(item.data()?.displayName ?? item.data()?.email ?? item.id),
      ]),
  );
  const issueNames = new Map(
    issueTypes.docs.map((item) => [item.id, String(item.data().name ?? "")]),
  );
  const timeline = [
    ...visits.docs.map((item) => {
      const data = item.data();
      const decision = String(data.conversion?.decision ?? "sin decisión");
      const notesText = String(data.feedback?.notes ?? "").trim();
      const issueLabels = (Array.isArray(data.issues) ? data.issues : [])
        .map(String)
        .map((id) => issueNames.get(id))
        .filter(Boolean)
        .join(", ");
      return {
        id: `visit-${item.id}`,
        type: "event",
        title: `Visita · ${decision.toUpperCase()}`,
        date: asIso(
          data.completedAt ?? data.feedbackUpdatedAt ?? data.startedAt,
        ),
        description: [
          names.get(String(data.visitUid ?? ""))
            ? `Militante: ${names.get(String(data.visitUid ?? ""))}`
            : "",
          notesText,
          issueLabels ? `Temas: ${issueLabels}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }),
    ...notes.docs.map((item) => {
      const data = item.data();
      return {
        id: `note-${item.id}`,
        type: "event",
        title: "Nota agregada",
        date: asIso(data.createdAt),
        description: `${names.get(String(data.authorUid ?? "")) ?? "Usuario"}: ${String(data.text ?? "")}`,
      };
    }),
    ...events.docs.map((item) => ({
      id: `event-${item.id}`,
      type: "event",
      title: String(item.data().title ?? "Actualización"),
      date: asIso(item.data().createdAt),
      description: String(item.data().description ?? ""),
    })),
  ].sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
  const currentIssues = (
    Array.isArray(voterData.issues) ? voterData.issues : []
  )
    .map(String)
    .map((id) => ({ id, name: issueNames.get(id) ?? "Tema eliminado" }));
  return {
    voter: { id: voter.id, ...voterData, issueDetails: currentIssues },
    household:
      allVoters?.docs
        .filter((item) => item.id !== voterId)
        .map((item) => ({
          id: item.id,
          name: String(item.data().name ?? "Elector"),
        })) ?? [],
    notes: notes.docs
      .map((item) => ({
        id: item.id,
        text: String(item.data().text ?? ""),
        createdAt: asIso(item.data().createdAt),
        author: names.get(String(item.data().authorUid ?? "")) ?? "Usuario",
      }))
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      ),
    timeline,
  };
}
export async function addVoterNote(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  voterId: string,
  input: unknown,
) {
  assertCampaignAccess(user, orgId, campId);
  const text = textInput(input);
  if (!text) throw new ValidationError("Escribí una nota antes de guardarla.");
  if (text.length > 4000)
    throw new ValidationError("La nota no puede superar los 4000 caracteres.");
  const ref = campaignRef(orgId, campId).collection("voters").doc(voterId);
  if (!(await ref.get()).exists)
    throw new ValidationError("El elector no existe.");
  const note = ref.collection("notes").doc();
  await note.set({
    text,
    authorUid: user.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: note.id, text };
}
export async function listDuplicateVoters(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
) {
  assertCampaignAccess(user, orgId, campId);
  const campaign = campaignRef(orgId, campId);
  const [voterSnapshot, visitSnapshot] = await Promise.all([
    campaign.collection("voters").get(),
    campaign.collection("visits").get(),
  ]);
  const visitCounts = new Map<string, number>();
  visitSnapshot.docs.forEach((visit) => {
    const voterId = String(visit.data().voterId ?? "");
    if (voterId) visitCounts.set(voterId, (visitCounts.get(voterId) ?? 0) + 1);
  });
  const voters = voterSnapshot.docs.map(
    (doc) =>
      ({
        id: doc.id,
        ...doc.data(),
        visitCount: visitCounts.get(doc.id) ?? 0,
      }) as Record<string, any>,
  );
  const parent = voters.map((_, index) => index);
  const root = (index: number): number =>
    parent[index] === index ? index : (parent[index] = root(parent[index]));
  const join = (a: number, b: number) => {
    const left = root(a);
    const right = root(b);
    if (left !== right) parent[right] = left;
  };
  const byNameAddress = new Map<string, number>();
  const byPhone = new Map<string, number>();
  voters.forEach((voter, index) => {
    const nameAddress = `${norm(String(voter.name ?? ""))}|${normalizeVoterAddress(String(voter.address ?? ""))}`;
    if (nameAddress !== "|") {
      const prior = byNameAddress.get(nameAddress);
      if (prior !== undefined) join(prior, index);
      else byNameAddress.set(nameAddress, index);
    }
    const phone = textInput(voter.phone);
    if (phone) {
      const prior = byPhone.get(phone);
      if (prior !== undefined) join(prior, index);
      else byPhone.set(phone, index);
    }
  });
  const groups = new Map<number, Record<string, any>[]>();
  voters.forEach((voter, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), voter]);
  });
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((voters) => ({
      key: voters
        .map((voter) => voter.id)
        .sort()
        .join("-"),
      voters,
    }));
}

export async function mergeVoters(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  keepId: string,
  mergeIds: unknown,
) {
  assertCampaignManager(user, orgId, campId);
  const removals = Array.isArray(mergeIds)
    ? [
        ...new Set(
          mergeIds.filter(
            (id): id is string => typeof id === "string" && id !== keepId,
          ),
        ),
      ]
    : [];
  if (!keepId || !removals.length)
    throw new ValidationError(
      "Elegí un elector principal y al menos un duplicado para fusionar.",
    );
  const campaign = campaignRef(orgId, campId);
  const keepRef = campaign.collection("voters").doc(keepId);
  const snapshots = await Promise.all([
    keepRef.get(),
    ...removals.map((id) => campaign.collection("voters").doc(id).get()),
  ]);
  if (
    !snapshots[0].exists ||
    snapshots.slice(1).some((snapshot) => !snapshot.exists)
  )
    throw new ValidationError("Uno de los electores a fusionar ya no existe.");
  const keep = snapshots[0].data()!;
  const merged = snapshots.slice(1).map((snapshot) => snapshot.data()!);
  const fields = [
    "phone",
    "email",
    "address",
    "section",
    "householdId",
  ] as const;
  const additions: Record<string, unknown> = {};
  fields.forEach((field) => {
    if (!keep[field]) {
      const found = merged.find((item) => item[field]);
      if (found) additions[field] = found[field];
    }
  });
  const tags = [
    ...new Map(
      [
        ...(Array.isArray(keep.tags) ? keep.tags : []),
        ...merged.flatMap((item) =>
          Array.isArray(item.tags) ? item.tags : [],
        ),
      ].map((tag) => [norm(String(tag)), String(tag)]),
    ).values(),
  ];
  const visits = await campaign.collection("visits").get();
  const batch = campaign.firestore.batch();
  batch.update(keepRef, {
    ...additions,
    tags,
    updatedAt: FieldValue.serverTimestamp(),
  });
  visits.docs
    .filter((visit) => removals.includes(String(visit.data().voterId)))
    .forEach((visit) =>
      batch.update(visit.ref, {
        voterId: keepId,
        mergedFromVoterId: visit.data().voterId,
      }),
    );
  snapshots.slice(1).forEach((snapshot) => batch.delete(snapshot.ref));
  await batch.commit();
  return {
    keepId,
    mergedIds: removals,
    reassignedVisits: visits.docs.filter((visit) =>
      removals.includes(String(visit.data().voterId)),
    ).length,
  };
}
export async function listVoters(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
) {
  assertCampaignAccess(user, orgId, campId);
  const snap = await campaignRef(orgId, campId).collection("voters").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
