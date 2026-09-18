import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { firestore } from '../lib/firebase';

type PublicRanking = { name: string; location: string; date: string; candidates: Array<{ id: string; name: string; party: string; photoUrl?: string | null; partyLogoUrl?: string | null; partyColor?: string | null; votes: number }> };
export default function PublicVoteStreamRanking() {
  const { orgId = '', campId = '', voteStreamId = '' } = useParams(); const [ranking, setRanking] = useState<PublicRanking | null>(null); const [missing, setMissing] = useState(false);
  useEffect(() => onSnapshot(doc(firestore, 'organizations', orgId, 'campaigns', campId, 'publicVoteRankings', voteStreamId), (snapshot) => { setRanking(snapshot.exists() ? snapshot.data() as PublicRanking : null); setMissing(!snapshot.exists()); }, () => setMissing(true)), [orgId, campId, voteStreamId]);
  const rows = useMemo(() => [...(ranking?.candidates ?? [])].sort((a, b) => b.votes - a.votes), [ranking]); const total = rows.reduce((sum, row) => sum + row.votes, 0);
  if (missing) return <main className="vote-public-ranking"><h1>Ranking no disponible</h1></main>;
  return <main className="vote-public-ranking"><header><span>VOTE STREAM</span><h1>{ranking?.name ?? 'Cargando ranking…'}</h1><p>{ranking?.location} · {ranking?.date}</p></header><section aria-live="polite">{rows.map((candidate, index) => <article key={candidate.id} className="vote-public-ranking__row" style={{ '--vote-party-color': candidate.partyColor || '#0060F0' } as CSSProperties}><span>#{index + 1}</span><span className="vote-public-ranking__identity">{candidate.photoUrl ? <img src={candidate.photoUrl} alt="" /> : <span className="vote-public-ranking__avatar">{candidate.name.slice(0, 2)}</span>}{candidate.partyLogoUrl && <img className="vote-public-ranking__party-logo" src={candidate.partyLogoUrl} alt={`Logo de ${candidate.party}`} />}</span><div><strong>{candidate.name}</strong><small>{candidate.party}</small></div><b>{total ? Math.round(candidate.votes / total * 100) : 0}%</b><em>{candidate.votes} votos</em></article>)}</section><footer>Los datos publicados no son datos oficiales, son informaciones enviadas por el equipo de campaña. Compartir estos datos se encuentra sujeto a la legislación electoral de su país.</footer></main>;
}
