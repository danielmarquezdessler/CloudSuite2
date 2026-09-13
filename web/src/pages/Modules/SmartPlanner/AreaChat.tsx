import { FormEvent, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { useCampaign } from '../Organization/useCampaign';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import PageContainer from '../../../components/Shared/PageContainer';
import ContentPanel from '../../../components/Shared/ContentPanel';
import Stack from '../../../components/Shared/Stack';
import Inline from '../../../components/Shared/Inline';

type Area = { id: string; name: string };
type Message = { id: string; text: string; senderName: string };
type Props = { embedded?: boolean; areaId?: string };

export default function AreaChat({ embedded = false, areaId: initialAreaId }: Props) {
  const { user } = useAuth();
  const { campaign } = useCampaign();
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const areasQ = useAuthenticatedQuery<Area[]>(user, base ? `${base}/areas` : null, [base]);
  const [selectedAreaId, setSelectedAreaId] = useState(initialAreaId ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const activeAreaId = initialAreaId || selectedAreaId || areasQ.data?.[0]?.id || '';

  useEffect(() => {
    if (!campaign || !activeAreaId) return undefined;
    setError('');
    return onSnapshot(
      query(collection(firestore, 'organizations', campaign.orgId, 'campaigns', campaign.campId, 'spAreas', activeAreaId, 'messages'), orderBy('createdAt', 'asc')),
      (snapshot) => setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Message))),
      () => setError('No pudimos actualizar el chat en tiempo real. Intentá de nuevo.')
    );
  }, [campaign?.orgId, campaign?.campId, activeAreaId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!user || !base || !activeAreaId || !text.trim()) return;
    try {
      await authenticatedFetch(user, `${base}/areas/${activeAreaId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos enviar el mensaje.');
    }
  }

  const contents = <Stack gap="sm">
    {!embedded && <Inline gap="sm" wrap>{(areasQ.data ?? []).map((area) => <button type="button" key={area.id} className={`btn btn-sm ${area.id === activeAreaId ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setSelectedAreaId(area.id)}>{area.name}</button>)}</Inline>}
    <Stack gap="xs">{messages.length ? messages.map((message) => <div key={message.id}><strong>{message.senderName}: </strong>{message.text}</div>) : <small className="text-muted">Todavía no hay mensajes en esta área.</small>}</Stack>
    {error && <div role="alert" className="alert alert-danger mb-0">{error}</div>}
    <form onSubmit={send}><Inline gap="sm"><input aria-label="Mensaje de chat" className="form-control" value={text} onChange={(event) => setText(event.target.value)} placeholder="Escribí un mensaje para el equipo…" required /><button className="btn btn-primary">Enviar</button></Inline></form>
  </Stack>;

  if (embedded) return <ContentPanel icon="chat" title="Chat del área" subtitle="Mensajes en tiempo real del frente seleccionado.">{contents}</ContentPanel>;
  return <PageContainer><ContentPanel icon="chat" title="Chat por área" subtitle="Conversación interna en tiempo real.">{contents}</ContentPanel></PageContainer>;
}
