import { ReactNode } from 'react';
import ProgressIndicator from './ProgressIndicator';
import Stack from '../Shared/Stack';
export default function StatCard({ icon, value, label, progress, tone = 'primary' }: { icon: string; value: ReactNode; label: string; progress?: number; tone?: string }) { return <article className="planning-stat-card"><Stack gap="sm"><span className={`planning-icon bg-${tone}-subtle text-${tone}`}><i className={`ti ti-${icon}`} /></span><strong className="planning-stat-card__value">{value}</strong><span className="planning-stat-card__label">{label}</span>{progress !== undefined && <ProgressIndicator value={progress} compact />}</Stack></article>; }
