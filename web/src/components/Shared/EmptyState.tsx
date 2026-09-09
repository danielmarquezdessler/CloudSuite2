import EmptyStateIcon from './EmptyStateIcon';
import PrimaryButton from './PrimaryButton';
import { Icon } from './Icons';
const iconMap: Record<string, Parameters<typeof Icon>[0]['name']> = { users: 'people', award: 'award', 'bar-chart-2': 'bars', 'trending-up': 'trend', map: 'map' };
export default function EmptyState({ icon, title, description, ctaLabel, onCtaClick }: { icon: string; title: string; description: string; ctaLabel?: string; onCtaClick?: () => void }) { return <div className="cd-empty-state"><EmptyStateIcon icon={iconMap[icon] || 'bars'} /><h3>{title}</h3><p>{description}</p>{ctaLabel && <PrimaryButton icon="plus" onClick={onCtaClick}>{ctaLabel}</PrimaryButton>}</div>; }
