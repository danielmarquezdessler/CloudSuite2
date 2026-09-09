import { Icon } from './Icons';

export default function EmptyStateIcon({ icon }: { icon: Parameters<typeof Icon>[0]['name'] }) {
  return <span className="cd-empty-state__icon"><Icon name={icon} size={30} color="#7ba6ee" strokeWidth={1.9} /></span>;
}
