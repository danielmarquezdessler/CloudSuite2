import { ReactNode } from 'react';
import { Icon } from './Icons';

export default function CardHeader({ icon, title, subtitle, action, tileBg }: { icon: Parameters<typeof Icon>[0]['name']; title: string; subtitle?: string; action?: ReactNode; tileBg?: string }) {
  return <header className="cd-card__header"><span className="cd-card__header-tile" style={{ background: tileBg || '#e7effc' }}><Icon name={icon} size={22} color="#2f6fe4" strokeWidth={2} /></span><div className="cd-card__header-copy"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="cd-card__header-action">{action}</div>}</header>;
}
