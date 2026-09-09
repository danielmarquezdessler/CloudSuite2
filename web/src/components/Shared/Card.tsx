import { ReactNode } from 'react';
import CardHeader from './CardHeader';
import { Icon } from './Icons';

export default function Card({ icon, title, subtitle, headerAction, children, className = '', bodyClassName = '', flushBody = false }: { icon?: Parameters<typeof Icon>[0]['name']; title?: string; subtitle?: string; headerAction?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; flushBody?: boolean }) {
  return <section className={'cd-card ' + className}>{icon && title && <CardHeader icon={icon} title={title} subtitle={subtitle} action={headerAction} />}<div className={'cd-card__body ' + (flushBody ? 'cd-card__body--flush ' : '') + bodyClassName}>{children}</div></section>;
}
