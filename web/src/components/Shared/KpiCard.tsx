import { ReactNode } from 'react';
import { Icon } from './Icons';

type Theme = 'blue' | 'green' | 'red' | 'orange' | 'purple';
const colors: Record<Theme, { bg: string; color: string }> = { blue: { bg: '#e7effc', color: '#2f6fe4' }, green: { bg: '#dcf8ed', color: '#10b981' }, red: { bg: '#fde8ec', color: '#ef4444' }, orange: { bg: '#fdf0dc', color: '#f59e0b' }, purple: { bg: '#efeaff', color: '#7c4dff' } };

export default function KpiCard({ icon, iconColor = 'blue', value, label, caption, captionColor, progress, linkText, onLinkClick }: { icon: Parameters<typeof Icon>[0]['name']; iconColor?: Theme; value: ReactNode; label: string; caption?: string; captionColor?: string; progress?: number; linkText?: string; onLinkClick?: () => void }) {
  const safe = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  const theme = colors[iconColor];
  return <article className="cd-kpi-card"><Icon className="cd-kpi-card__ghost" name={icon} size={96} color={theme.bg} strokeWidth={2.25} /><div className="cd-kpi-card__top"><span className="cd-kpi-card__tile" style={{ background: theme.bg }}><Icon name={icon} size={25} color={theme.color} strokeWidth={2} /></span><div><div className="cd-kpi-card__label">{label}</div><div className="cd-kpi-card__value">{value}</div>{caption && <div className="cd-kpi-card__caption" style={{ color: captionColor || theme.color }}>{caption}</div>}</div></div>{progress !== undefined && <div className="cd-kpi-card__progress"><div><span style={{ width: safe + '%', background: theme.color }} /></div><b>{safe}%</b></div>}{linkText && <button type="button" onClick={onLinkClick} className="cd-kpi-card__link"><span>{linkText}</span><Icon name="chevron-right" size={14} color="#9aafc9" strokeWidth={2.2} /></button>}</article>;
}
