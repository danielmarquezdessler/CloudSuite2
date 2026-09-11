import { useEffect, useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { authenticatedFetch } from '../../../lib/api';
import { ensureVisitDraft, OfflineQuestion, queueConversion, queueFeedback, saveVisitProgress, syncPendingVisits, VisitDraft } from '../../../lib/offlineVisits';
import { useCampaign } from '../Organization/useCampaign';
import { useOfflineSync } from '../../../context/OfflineSyncContext';
import { Toast } from '../../../components/Toast';
import Card from '../../../components/Shared/Card';
import Inline from '../../../components/Shared/Inline';
import OfflineVisitStatus from '../../../components/Shared/OfflineVisitStatus';
import PageContainer from '../../../components/Shared/PageContainer';
import Stack from '../../../components/Shared/Stack';
import SelectControl from '../../../components/Shared/SelectControl';
import MultiSelectControl from '../../../components/Shared/MultiSelectControl';

const fallback: OfflineQuestion[] = [
  { id: 'children', text: '¿Tiene hijos en edad escolar?', type: 'radio', isRequired: false, options: [{ label: 'Sí', value: 'si' }, { label: 'No', value: 'no' }] },
  { id: 'years', text: '¿Vive en la zona desde hace más de 5 años?', type: 'radio', isRequired: false, options: [{ label: 'Sí', value: 'si' }, { label: 'No', value: 'no' }] },
  { id: 'concern', text: '¿Cuál es tu principal preocupación?', type: 'text', isRequired: true, options: [] },
  { id: 'campaign', text: '¿Cómo se enteró de nuestra campaña?', type: 'text', isRequired: true, options: [] },
  { id: 'question', text: '¿Hay algo que te gustaría preguntar?', type: 'text', isRequired: true, options: [] }
];

export default function VisitScreen() {
  const { voterId = '' } = useParams();
  const { user, campaign } = useCampaign();
  const syncState = useOfflineSync();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<OfflineQuestion[]>(fallback);
  const [principal, setPrincipal] = useState<{ name: string; type: string; customType?: string | null } | null>(null);
  const [draft, setDraft] = useState<VisitDraft | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [household, setHousehold] = useState<Array<{ id: string; name: string; householdId?: string | null }>>([]);
  const [applyToHousehold, setApplyToHousehold] = useState(false);
  const [householdDecisions, setHouseholdDecisions] = useState<Record<string, string>>({});
  const [issueTypes, setIssueTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [newIssueName, setNewIssueName] = useState('');

  useEffect(() => {
    if (!user || !campaign || !voterId) return;
    let mounted = true;
    void ensureVisitDraft(campaign.orgId, campaign.campId, voterId, questions).then(created => { if (mounted) setDraft(created); }).catch(caught => { if (mounted) setError(caught instanceof Error ? caught.message : 'No pudimos preparar la visita local.'); });
    return () => { mounted = false; };
  }, [campaign?.campId, campaign?.orgId, user, voterId]);

  useEffect(() => {
    if (!user || !campaign) return;
    void authenticatedFetch(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/question-sets/active`)
      .then((data: { active: { questions: OfflineQuestion[] } | null }) => { if (data.active?.questions?.length) setQuestions(data.active.questions); })
      .catch(() => setQuestions(fallback));
  }, [campaign?.campId, campaign?.orgId, user]);

  useEffect(() => {
    if (!user || !campaign) return;
    void authenticatedFetch<Array<{ id: string; name: string }>>(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/issues/types`).then(setIssueTypes).catch(() => setIssueTypes([]));
  }, [campaign?.campId, campaign?.orgId, user]);

  useEffect(() => {
    if (!user || !campaign || !voterId) return;
    void authenticatedFetch<Array<{ id: string; name: string; householdId?: string | null }>>(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters`).then((voters) => {
      const currentVoter = voters.find((voter) => voter.id === voterId);
      const members = currentVoter?.householdId ? voters.filter((voter) => voter.householdId === currentVoter.householdId) : [];
      setHousehold(members); setHouseholdDecisions(Object.fromEntries(members.map((member) => [member.id, member.id === voterId ? 'yes' : 'undecided'])));
    }).catch(() => setHousehold([]));
  }, [campaign?.campId, campaign?.orgId, user, voterId]);

  useEffect(() => {
    if (!user || !campaign) return;
    void authenticatedFetch<Array<{ name: string; type: string; customType?: string | null; isPrincipal: boolean }>>(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/candidates`)
      .then((items) => setPrincipal(items.find((candidate) => candidate.isPrincipal) ?? null))
      .catch(() => setPrincipal(null));
  }, [campaign?.campId, campaign?.orgId, user]);

  useEffect(() => {
    if (!draft || draft.questions === questions) return;
    setDraft(current => current ? { ...current, questions, updatedAt: Date.now() } : current);
    void saveVisitProgress(draft.key, { step: draft.step, answers: draft.answers, notes: draft.notes, issues: draft.issues ?? [], questions });
  }, [draft, questions]);

  const required = useMemo(() => questions.filter(question => question.isRequired), [questions]);
  const optional = useMemo(() => questions.filter(question => !question.isRequired), [questions]);
  const step = draft?.step ?? 0;
  const answers = draft?.answers ?? {};
  const notes = draft?.notes ?? '';
  const issues = draft?.issues ?? [];
  const current = step === 0 ? optional : step === 1 ? required : [];

  const updateDraft = (changes: Partial<Pick<VisitDraft, 'step' | 'answers' | 'notes' | 'issues' | 'questions'>>) => {
    setDraft(currentDraft => {
      if (!currentDraft) return currentDraft;
      const next = { ...currentDraft, ...changes, updatedAt: Date.now() };
      void saveVisitProgress(next.key, { step: next.step, answers: next.answers, notes: next.notes, issues: next.issues ?? [], questions: next.questions });
      return next;
    });
  };

  const updateAnswer = (question: OfflineQuestion, value: string) => {
    const previous = draft?.answers ?? {};
    const selected = Array.isArray(previous[question.id]) ? previous[question.id] as string[] : [];
    const next = question.type === 'checkbox'
      ? { ...previous, [question.id]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value] }
      : { ...previous, [question.id]: value };
    updateDraft({ answers: next });
  };

  const saveCurrentFeedback = async () => {
    if (!draft || !user) return;
    await saveVisitProgress(draft.key, { step: draft.step, answers: draft.answers, notes: draft.notes, issues: draft.issues ?? [], questions });
    await queueFeedback(draft.key);
    await syncPendingVisits(user);
  };

  const next = async () => {
    if (!draft) return;
    if (step === 1 && required.some(question => !answers[question.id] || (Array.isArray(answers[question.id]) && !answers[question.id].length))) { setError('Respondé todas las preguntas obligatorias.'); return; }
    try { setError(''); await saveCurrentFeedback(); updateDraft({ step: Math.min(3, step + 1) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar la visita localmente.'); }
  };

  const decide = async (decision: string) => {
    if (!draft || !user) return;
    try {
      setError('');
      await saveCurrentFeedback();
      await queueConversion(draft.key, decision);
      await syncPendingVisits(user);
      setToast(navigator.onLine ? 'Visita registrada ✓' : 'Visita guardada sin conexión. Se sincronizará automáticamente.');
      window.setTimeout(() => navigate('/electoral-conversion/voters'), 900);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar la visita localmente.'); }
  };
  const decideHousehold = async () => {
    if (!user || !campaign || household.length < 2 || !household[0]?.householdId) return;
    try {
      setError('');
      if (!navigator.onLine) throw new Error('La visita para todo el hogar necesita conexión para registrar a cada persona. Podés registrar esta visita individual sin conexión.');
      await authenticatedFetch(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/households/${household[0].householdId}/visits`, { method: 'POST', body: JSON.stringify({ feedback: { responses: questions.map(question => ({ questionId: question.id, question: question.text, answer: answers[question.id] ?? null })), notes, issues, timestamp: new Date().toISOString() }, decisions: householdDecisions }) });
      setToast(`Visita registrada para ${household.length} personas ✓`); window.setTimeout(() => navigate('/electoral-conversion/voters'), 900);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo registrar la visita del hogar.'); }
  };
  const addIssue = async () => {
    if (!user || !campaign || !newIssueName.trim()) return;
    try { const created = await authenticatedFetch<{ id: string; name: string }>(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/issues/types`, { method: 'POST', body: JSON.stringify({ name: newIssueName }) }); setIssueTypes((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name, 'es'))); updateDraft({ issues: [...new Set([...issues, created.id])] }); setNewIssueName(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos crear el tema.'); }
  };

  const renderQuestion = (question: OfflineQuestion) => <div key={question.id}><label className="form-label">{question.text}{question.isRequired && ' *'}</label>{question.type === 'text' ? <input className="form-control" value={String(answers[question.id] ?? '')} onChange={event => updateAnswer(question, event.target.value)} /> : question.options.map(option => <div className="form-check" key={option.value}><input className="form-check-input" id={`${question.id}-${option.value}`} type={question.type === 'radio' ? 'radio' : 'checkbox'} name={question.id} checked={question.type === 'checkbox' ? Array.isArray(answers[question.id]) && answers[question.id].includes(option.value) : answers[question.id] === option.value} onChange={() => updateAnswer(question, option.value)} /><label className="form-check-label" htmlFor={`${question.id}-${option.value}`}>{option.label}</label></div>)}</div>;

  return <PageContainer><Stack gap="md">
    <OfflineVisitStatus state={syncState} />
    <Card icon="people" title="Visita electoral" subtitle={draft ? `Paso ${step + 1} de 4 · El progreso se guarda primero en este dispositivo.` : 'Preparando una copia local de la visita…'}>
      <Stack gap="md">
        {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
        {!draft ? <div className="text-muted">Preparando la visita para que puedas continuar incluso sin señal…</div> : <>
          {household.length > 1 && <div className="alert alert-info mb-0"><Stack gap="sm"><span>Este hogar tiene {household.length - 1} {household.length - 1 === 1 ? 'persona más' : 'personas más'} — podés registrar una sola conversación para todos.</span>{!applyToHousehold && <Inline gap="sm"><Button size="sm" variant="outline-primary" onClick={() => setApplyToHousehold(true)}>Registrar visita para todo el hogar</Button></Inline>}{applyToHousehold && <span className="small">Vas a completar el feedback una vez y elegir una decisión individual para cada persona al final.</span>}</Stack></div>}
          {current.map(renderQuestion)}
          {step === 2 && <Stack gap="md"><div><label className="form-label" htmlFor="visit-notes">Observaciones de la visita</label><textarea className="form-control" id="visit-notes" rows={6} value={notes} onChange={event => updateDraft({ notes: event.target.value })} /></div><div><label className="form-label">Temas mencionados</label><MultiSelectControl ariaLabel="Temas mencionados" label="Seleccioná temas" value={issues} onChange={(nextIssues) => updateDraft({ issues: nextIssues })} options={issueTypes.map((issue) => ({ value: issue.id, label: issue.name }))} /><Inline gap="sm" wrap className="mt-2"><input aria-label="Nuevo tema" className="form-control" value={newIssueName} onChange={(event) => setNewIssueName(event.target.value)} placeholder="Agregar tema nuevo" /><Button size="sm" variant="outline-primary" type="button" onClick={() => void addIssue()} disabled={!newIssueName.trim()}>Agregar tema</Button></Inline></div></Stack>}
          {step === 3 && <Stack gap="sm"><h2 className="h5 mb-0">{principal ? `¿Vota a ${principal.name} para ${principal.type === 'Otro' ? principal.customType || 'Otro' : principal.type}?` : '¿Vota al candidato?'}</h2>{applyToHousehold ? <Stack gap="sm"><p className="text-muted mb-0">Decisión individual de cada integrante del hogar:</p>{household.map((member) => <Inline gap="sm" className="justify-content-between align-items-center" key={member.id}><strong>{member.name}</strong><SelectControl ariaLabel={`Decisión de ${member.name}`} label={householdDecisions[member.id] === 'yes' ? 'SI' : householdDecisions[member.id] === 'no' ? 'NO' : 'INDECISO'} value={householdDecisions[member.id]} options={[{ value:'yes', label:'SI' }, { value:'no', label:'NO' }, { value:'undecided', label:'INDECISO' }]} onChange={(decision) => setHouseholdDecisions((current) => ({ ...current, [member.id]: decision }))} /></Inline>)}<Inline gap="sm"><Button variant="primary" size="lg" onClick={() => void decideHousehold()}>Registrar visitas del hogar</Button></Inline></Stack> : <Inline gap="sm" wrap><Button variant="success" size="lg" onClick={() => void decide('yes')}>SI</Button><Button variant="danger" size="lg" onClick={() => void decide('no')}>NO</Button><Button variant="warning" size="lg" onClick={() => void decide('undecided')}>INDECISO</Button></Inline>}</Stack>}
          <Inline gap="sm" className="justify-content-between" wrap>{step > 0 ? <Button variant="outline-secondary" onClick={() => updateDraft({ step: step - 1 })}>Anterior</Button> : <span />}{step < 3 && <Button onClick={() => void next()}>Siguiente</Button>}</Inline>
        </>}
      </Stack>
    </Card>
    {toast && <Toast message={toast} onClose={() => setToast('')} />}
  </Stack></PageContainer>;
}
