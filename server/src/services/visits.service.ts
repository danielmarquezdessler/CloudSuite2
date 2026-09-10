import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { assertCampaignAccess, campaignRef, NotFoundError, ValidationError } from './access.service.js';
export async function startVisit(user: DecodedIdToken, orgId: string, campId: string, voterId: string, requestedVisitId?: string) {
  assertCampaignAccess(user, orgId, campId);
  const campaign = campaignRef(orgId, campId);
  const voter = campaign.collection('voters').doc(voterId);
  const clientVisitId = requestedVisitId?.trim();
  if (clientVisitId && !/^[A-Za-z0-9_-]{8,128}$/.test(clientVisitId)) throw new ValidationError('El identificador local de visita no es válido.');
  const visit = clientVisitId ? campaign.collection('visits').doc(clientVisitId) : campaign.collection('visits').doc();
  let created = false;
  await campaign.firestore.runTransaction(async transaction => {
    const [voterSnapshot, visitSnapshot] = await Promise.all([transaction.get(voter), transaction.get(visit)]);
    if (!voterSnapshot.exists) throw new NotFoundError('El elector no existe.');
    if (visitSnapshot.exists) {
      const existing = visitSnapshot.data();
      if (existing?.voterId !== voterId || existing?.visitUid !== user.uid) throw new ValidationError('El identificador local de visita ya está en uso.');
      return;
    }
    transaction.set(visit, { voterId, visitUid: user.uid, startedAt: FieldValue.serverTimestamp(), state: 'in_progress' });
    transaction.update(voter, { state: 'visited', lastVisitUid: user.uid, visitedAt: FieldValue.serverTimestamp() });
    created = true;
  });
  return { visitId: visit.id, created };
}
export async function saveFeedback(user: DecodedIdToken, orgId: string, campId: string, voterId: string, visitId: string, feedback: unknown) { assertCampaignAccess(user, orgId, campId); const visit = campaignRef(orgId, campId).collection('visits').doc(visitId); if (!(await visit.get()).exists) throw new NotFoundError('La visita no existe.'); await visit.update({ feedback, feedbackUpdatedAt: FieldValue.serverTimestamp(), state: 'in_progress' }); }
export async function convertVisit(user: DecodedIdToken, orgId: string, campId: string, voterId: string, visitId: string, decision: string) { assertCampaignAccess(user, orgId, campId); if (!['yes', 'no', 'undecided'].includes(decision)) throw new ValidationError('La decisión no es válida.'); const campaign = campaignRef(orgId, campId); const visit = campaign.collection('visits').doc(visitId); const voter = campaign.collection('voters').doc(voterId); if (!(await visit.get()).exists) throw new NotFoundError('La visita no existe.'); const state = decision === 'yes' ? 'converted_yes' : decision === 'no' ? 'converted_no' : 'undecided'; await campaign.firestore.runTransaction(async transaction => { transaction.update(visit, { conversion: { decision, timestamp: FieldValue.serverTimestamp() }, state: decision === 'undecided' ? 'pending_revisit' : 'completed', completedAt: FieldValue.serverTimestamp() }); transaction.update(voter, { state, [`conversions.${decision}`]: FieldValue.increment(1), 'conversions.last_decision': decision, lastVisitUid: user.uid, visitedAt: FieldValue.serverTimestamp() }); }); }
/** Applies one shared conversation to every member of a household while preserving an individual decision. */
export async function completeHouseholdVisit(user: DecodedIdToken, orgId: string, campId: string, householdId: string, feedback: unknown, decisions: unknown) {
  assertCampaignAccess(user, orgId, campId);
  const campaign = campaignRef(orgId, campId);
  const members = await campaign.collection('voters').where('householdId', '==', householdId).get();
  if (members.empty) throw new NotFoundError('No encontramos miembros para este hogar.');
  const requested = decisions && typeof decisions === 'object' ? decisions as Record<string, unknown> : {};
  const invalid = members.docs.find((member) => !['yes', 'no', 'undecided'].includes(String(requested[member.id] ?? '')));
  if (invalid) throw new ValidationError(`Elegí una decisión para ${String(invalid.data().name ?? 'cada elector')}.`);
  const existingVisits = await campaign.collection('visits').get();
  const batch = campaign.firestore.batch();
  for (const member of members.docs) {
    const decision = String(requested[member.id]); const state = decision === 'yes' ? 'converted_yes' : decision === 'no' ? 'converted_no' : 'undecided';
    const existing = existingVisits.docs.find((visit) => visit.data().voterId === member.id && visit.data().visitUid === user.uid && visit.data().state === 'in_progress');
    const visitRef = existing?.ref ?? campaign.collection('visits').doc();
    const visitData = { voterId: member.id, visitUid: user.uid, householdId, feedback, feedbackUpdatedAt: FieldValue.serverTimestamp(), conversion: { decision, timestamp: FieldValue.serverTimestamp() }, state: decision === 'undecided' ? 'pending_revisit' : 'completed', completedAt: FieldValue.serverTimestamp() };
    if (existing) batch.update(visitRef, visitData); else batch.set(visitRef, { ...visitData, startedAt: FieldValue.serverTimestamp() });
    batch.update(member.ref, { state, [`conversions.${decision}`]: FieldValue.increment(1), 'conversions.last_decision': decision, lastVisitUid: user.uid, visitedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  return { householdId, memberCount: members.size };
}
export async function listVisits(user: DecodedIdToken, orgId: string, campId: string, voterId: string) { assertCampaignAccess(user, orgId, campId); const snap = await campaignRef(orgId, campId).collection('visits').where('voterId', '==', voterId).get(); return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }
