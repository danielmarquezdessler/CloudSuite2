import { DecodedIdToken } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { assertCampaignAccess, campaignRef, ValidationError } from './access.service.js';

export class GeminiConfigurationError extends Error {}
type Visit = { startedAt?: Timestamp; conversion?: { decision?: string } }; type Task = { status?: string; completedAt?: Timestamp }; type Incident = { createdAt?: Timestamp };
const todayKey = () => new Date().toISOString().slice(0, 10);
const todayRange = () => { const start = new Date(); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }; };
const isToday = (timestamp?: Timestamp) => { const { start, end } = todayRange(); const value = timestamp?.toDate().getTime() ?? 0; return value >= start.getTime() && value < end.getTime(); };

async function stats(orgId: string, campId: string) {
  const campaign = campaignRef(orgId, campId); const [visits, tasks, incidents] = await Promise.all([campaign.collection('visits').get(), campaign.collection('tasks').get(), campaign.collection('incidents').get()]);
  const todayVisits = visits.docs.map((doc) => doc.data() as Visit).filter((visit) => isToday(visit.startedAt));
  const count = (decision: string) => todayVisits.filter((visit) => visit.conversion?.decision === decision).length;
  return { visits: todayVisits.length, yes: count('yes'), no: count('no'), undecided: count('undecided'), tasks: tasks.docs.map((doc) => doc.data() as Task).filter((task) => task.status === 'completada' && isToday(task.completedAt)).length, incidents: incidents.docs.map((doc) => doc.data() as Incident).filter((incident) => isToday(incident.createdAt)).length };
}
export async function getDailySummary(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId); const key = todayKey(); const doc = await campaignRef(orgId, campId).collection('dailySummaries').doc(key).get(); return { date: key, summary: doc.exists ? doc.data()?.summary ?? null : null, generatedAt: doc.data()?.generatedAt?.toDate?.().toISOString?.() ?? null, stats: await stats(orgId, campId) };
}
export async function generateDailySummary(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId); const key = todayKey(); const ref = campaignRef(orgId, campId).collection('dailySummaries').doc(key); const cached = await ref.get(); if (cached.exists) return { date:key, summary: cached.data()?.summary, generatedAt: cached.data()?.generatedAt?.toDate?.().toISOString?.(), cached:true, stats: await stats(orgId, campId) };
  const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) throw new GeminiConfigurationError('Configurá GEMINI_API_KEY para activar esta función.');
  const data = await stats(orgId, campId); const prompt = `Redactá un resumen de jornada de campaña política en español, profesional y cercano, de 3 a 4 párrafos. Usá únicamente estos datos: visitas ${data.visits}; conversiones favorables ${data.yes}; no favorables ${data.no}; indecisos ${data.undecided}; tareas completadas ${data.tasks}; incidencias reportadas ${data.incidents}. Incluí un cierre con una recomendación accionable. No inventes cifras.`;
  const model = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash'; const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.4} }) });
  if (!response.ok) throw new ValidationError(`Gemini no pudo generar el resumen (${response.status}).`);
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }; const summary = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim(); if (!summary) throw new ValidationError('Gemini devolvió un resumen vacío.');
  await ref.set({ summary, stats:data, generatedAt: Timestamp.now(), generatedBy:user.uid }); return { date:key, summary, generatedAt:new Date().toISOString(), cached:false, stats:data };
}
