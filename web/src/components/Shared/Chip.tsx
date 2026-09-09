import { Icon } from './Icons';

export default function Chip({ icon, label, caret = false }: { icon?: Parameters<typeof Icon>[0]['name']; label: string; caret?: boolean }) {
  return <span className="cd-chip">{icon && <Icon name={icon} size={15} color="#2f6fe4" strokeWidth={2} />}{label}{caret && <Icon name="chevron-down" size={13} color="#33507a" strokeWidth={2.2} className="cd-chip__caret" />}</span>;
}
