import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import { assertCampaignAccess, assertCampaignManager, campaignRef, ValidationError } from './access.service.js';

type Row = Record<string, unknown>;
const value = (row: Row, names: string[]) => { const key = Object.keys(row).find(key => names.includes(key.trim().toLowerCase())); return String(key ? row[key] ?? '' : '').trim(); };
const norm = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function geocode(address: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`);
  const data = await response.json() as { status?: string; results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }> };
  if (!response.ok || data.status !== 'OK' || !data.results?.[0]) return null;
  const result = data.results[0]; return { lat: result.geometry.location.lat, lng: result.geometry.location.lng, formattedAddress: result.formatted_address };
}
function parseFile(file: Express.Multer.File) { const workbook = XLSX.read(file.buffer, { type: 'buffer' }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; return XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' }); }
export async function importVoters(user: DecodedIdToken, orgId: string, campId: string, file: Express.Multer.File | undefined, allowNearDuplicates: boolean) {
  assertCampaignManager(user, orgId, campId); if (!file) throw new ValidationError('Seleccioná un archivo CSV o Excel.');
  const rows = parseFile(file); const ref = campaignRef(orgId, campId); const existing = await ref.collection('voters').get(); const known = new Set(existing.docs.map(doc => `${norm(String(doc.data().name ?? ''))}|${norm(String(doc.data().address ?? ''))}`));
  const errorRows: { rowNum: number; error: string }[] = []; const voters: Array<Record<string, unknown>> = []; let duplicateCount = 0; let noGeoCount = 0; let nearDuplicateCount = 0; const coordinates = new Set<string>();
  for (const [index, row] of rows.entries()) { const name = value(row, ['nombre', 'name']); const address = value(row, ['direccion', 'dirección', 'direcciã³n', 'address']); if (!name || !address) { errorRows.push({ rowNum: index + 2, error: 'Nombre y Dirección son obligatorios.' }); continue; } const key = `${norm(name)}|${norm(address)}`; if (known.has(key)) { duplicateCount++; continue; } known.add(key); const geo = await geocode(address); if (geo) { const coordinate = `${geo.lat.toFixed(6)},${geo.lng.toFixed(6)}`; if (coordinates.has(coordinate)) { nearDuplicateCount++; if (!allowNearDuplicates) { duplicateCount++; continue; } } coordinates.add(coordinate); } else { noGeoCount++; console.warn(`[CloudSuite] No se pudo geocodificar: ${address}`); } voters.push({ id: value(row, ['id']) || ref.collection('voters').doc().id, name, address: geo?.formattedAddress ?? address, phone: value(row, ['telefono', 'teléfono', 'telã©fono', 'phone']) || null, email: value(row, ['email']) || null, lat: geo?.lat ?? null, lng: geo?.lng ?? null, state: 'unvisited', visitedAt: null, lastVisitUid: null, feedback: null, conversions: { yes: 0, no: 0, undecided: 0, last_decision: null }, createdAt: FieldValue.serverTimestamp() }); await delay(20); }
  if (voters.length > 450) throw new ValidationError('El MVP admite hasta 450 electores por importación para garantizar una escritura atómica.');
  const batch = ref.firestore.batch(); voters.forEach(voter => batch.set(ref.collection('voters').doc(String(voter.id)), voter)); const importRef = ref.collection('imports').doc(); const report = { importedCount: voters.length, duplicateCount, noGeoCount, nearDuplicateCount, errorRows, totalProcessedRows: rows.length }; batch.set(importRef, { status: 'completed', timestamp: FieldValue.serverTimestamp(), counts: report, errorRows, file: file.originalname }); await batch.commit(); return report;
}
export async function listVoters(user: DecodedIdToken, orgId: string, campId: string) { assertCampaignAccess(user, orgId, campId); const snap = await campaignRef(orgId, campId).collection('voters').get(); return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }
