import { ReactNode } from 'react';
import Chip from './Chip';
import { Icon, Mountain } from './Icons';
import PrimaryButton from './PrimaryButton';

const iconMap: Record<string, Parameters<typeof Icon>[0]['name']> = { 'bar-chart-2': 'bars', bars: 'bars', users: 'people', people: 'people', map: 'map', 'map-pin': 'pin', calendar: 'cal', target: 'target', clock: 'clock', activity: 'pulse', plus: 'plus', download: 'doc', 'upload-cloud': 'doc', file: 'doc', 'user-check': 'check', 'check-circle': 'check', settings: 'gear' };
type Tag = { icon: string; label: string };
export default function HeroBanner({ icon, title, subtitle, subtitleDetail, tags = [], ctaLabel, ctaIcon = 'plus', onCtaClick, ctaDisabled = false, extraFilters }: { icon: string; title: string; subtitle: string; subtitleDetail?: string; tags?: Tag[]; ctaLabel?: string; ctaIcon?: string; onCtaClick?: () => void; ctaDisabled?: boolean; extraFilters?: ReactNode }) {
  return <header className="cd-hero"><Mountain /><div className="cd-hero__content"><span className="cd-hero__tile"><Icon name={iconMap[icon] || 'bars'} size={32} color="#fff" strokeWidth={1.7} /></span><div className="cd-hero__copy"><h1>{title}</h1><p>{subtitle}</p>{subtitleDetail && <small>{subtitleDetail}</small>}<div className="cd-hero__chips">{tags.map(tag => <Chip key={tag.label} icon={iconMap[tag.icon] || 'bars'} label={tag.label} />)}</div></div></div><div className="cd-hero__aside"><div className="cd-hero__tagline">Más territorio.<br />Más conversaciones.<br />Más impacto.</div><div className="cd-hero__actions">{extraFilters}<div className="cd-hero__cta">{ctaLabel && <PrimaryButton icon={iconMap[ctaIcon] || 'plus'} onClick={onCtaClick} disabled={ctaDisabled}>{ctaLabel}</PrimaryButton>}</div></div></div></header>;
}
