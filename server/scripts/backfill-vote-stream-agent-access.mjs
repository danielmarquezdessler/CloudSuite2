import { backfillVoteStreamAgentAccess } from '../dist/services/voteStreamService.js';

const apply = process.argv.includes('--apply');
const result = await backfillVoteStreamAgentAccess(apply);
console.log(`Vote Stream legacy agent backfill ${result.applied ? 'applied' : 'dry-run'}: ${result.assignments} asignaciones, ${result.users} usuarios, ${result.campaigns} campañas.`);
if (!apply) console.log('Sin escrituras. Ejecutá con --apply para reparar membresías, claims y entitlement.');
