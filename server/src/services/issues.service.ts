import { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import {
  assertCampaignAccess,
  assertCampaignManager,
  campaignRef,
  NotFoundError,
  ValidationError,
} from "./access.service.js";

const defaults = [
  "Seguridad",
  "Empleo",
  "Salud",
  "Servicios públicos",
  "Educación",
  "Vivienda",
];
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const canonical = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

async function ensureDefaults(orgId: string, campId: string) {
  const campaign = campaignRef(orgId, campId);
  const snapshot = await campaign.collection("issueTypes").get();
  const existing = new Set(
    snapshot.docs.map((item) => canonical(String(item.data().name ?? ""))),
  );
  const missing = defaults.filter((name) => !existing.has(canonical(name)));
  if (missing.length) {
    const batch = campaign.firestore.batch();
    missing.forEach((name) =>
      batch.set(campaign.collection("issueTypes").doc(), {
        name,
        createdAt: FieldValue.serverTimestamp(),
        isDefault: true,
      }),
    );
    await batch.commit();
  }
  return campaign.collection("issueTypes").get();
}

export async function listIssueTypes(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
) {
  assertCampaignAccess(user, orgId, campId);
  const snapshot = await ensureDefaults(orgId, campId);
  return snapshot.docs
    .map((item) => ({ id: item.id, name: String(item.data().name ?? "") }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

export async function createIssueType(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  input: unknown,
) {
  assertCampaignManager(user, orgId, campId);
  const name = text(input);
  if (!name) throw new ValidationError("Indicá el nombre del tema.");
  if (name.length > 80)
    throw new ValidationError("El tema no puede superar los 80 caracteres.");
  const campaign = campaignRef(orgId, campId);
  const types = await campaign.collection("issueTypes").get();
  if (
    types.docs.some(
      (item) => canonical(String(item.data().name ?? "")) === canonical(name),
    )
  )
    throw new ValidationError("Ese tema ya existe en la campaña.");
  const ref = campaign.collection("issueTypes").doc();
  await ref.set({
    name,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: user.uid,
  });
  return { id: ref.id, name };
}

export async function updateIssueType(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  issueId: string,
  input: unknown,
) {
  assertCampaignManager(user, orgId, campId);
  const name = text(input);
  if (!name || name.length > 80)
    throw new ValidationError("Indicá un tema válido de hasta 80 caracteres.");
  const campaign = campaignRef(orgId, campId);
  const ref = campaign.collection("issueTypes").doc(issueId);
  if (!(await ref.get()).exists) throw new NotFoundError("El tema no existe.");
  await ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
  return { id: issueId, name };
}

export async function deleteIssueType(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  issueId: string,
) {
  assertCampaignManager(user, orgId, campId);
  const ref = campaignRef(orgId, campId).collection("issueTypes").doc(issueId);
  if (!(await ref.get()).exists) throw new NotFoundError("El tema no existe.");
  await ref.delete();
}

export async function issueSummary(
  user: DecodedIdToken,
  orgId: string,
  campId: string,
  start?: string,
  end?: string,
) {
  assertCampaignAccess(user, orgId, campId);
  const campaign = campaignRef(orgId, campId);
  const [types, visits] = await Promise.all([
    listIssueTypes(user, orgId, campId),
    campaign.collection("visits").get(),
  ]);
  const names = new Map(types.map((item) => [item.id, String(item.name)]));
  const from = start ? new Date(`${start}T00:00:00`) : null;
  const until = end ? new Date(`${end}T23:59:59.999`) : null;
  const counts = new Map<string, number>();
  visits.docs.forEach((visit) => {
    const data = visit.data();
    const timestamp =
      data.completedAt?.toDate?.() ??
      data.feedbackUpdatedAt?.toDate?.() ??
      data.startedAt?.toDate?.();
    if (from && (!timestamp || timestamp < from)) return;
    if (until && (!timestamp || timestamp > until)) return;
    (Array.isArray(data.issues) ? data.issues : []).forEach((id) => {
      const issueId = String(id);
      counts.set(issueId, (counts.get(issueId) ?? 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([issueId, count]) => ({
      issueId,
      name: names.get(issueId) ?? "Tema eliminado",
      count,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name, "es"),
    );
}
