import { ReactNode } from 'react';
import { Icon } from './Icons';

export default function SelectControl({ label, icon, className = '', children }: { label: string; icon?: Parameters<typeof Icon>[0]['name']; className?: string; children?: ReactNode }) {
  return <button type="button" className={'cd-select-control ' + className}>{icon && <Icon name={icon} size={16} color="#2f6fe4" strokeWidth={2} />}<span>{label}</span>{children}<Icon name="chevron-down" size={14} color="#6b86ad" strokeWidth={2.2} /></button>;
}
