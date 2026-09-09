import { ReactNode } from 'react';
import { Icon } from './Icons';
import Inline from './Inline';
import Stack from './Stack';

export default function CardHeader({ icon, title, subtitle, action, tileBg }: { icon: Parameters<typeof Icon>[0]['name']; title: string; subtitle?: string; action?: ReactNode; tileBg?: string }) {
  return <header className="cd-card__header" data-card-header="true"><Inline gap="md"><span className="cd-card__header-tile" style={{ background: tileBg || '#e7effc' }}><Icon name={icon} size={22} color="#2f6fe4" strokeWidth={2} /></span><Stack gap="xs" className="cd-card__header-copy"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</Stack>{action && <div className="cd-card__header-action">{action}</div>}</Inline></header>;
}
