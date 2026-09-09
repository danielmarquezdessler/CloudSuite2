import { ReactNode } from 'react';
import Card from './Card';
import { Icon } from './Icons';
const iconMap: Record<string, Parameters<typeof Icon>[0]['name']> = { 'trending-up': 'trend', 'pie-chart': 'pie', users: 'people', award: 'award', map: 'map', calendar: 'cal', target: 'target' };
export default function ContentPanel({ icon, title, subtitle, headerAction, children }: { icon: string; title: string; subtitle?: string; headerAction?: ReactNode; children: ReactNode }) { return <Card icon={iconMap[icon] || 'bars'} title={title} subtitle={subtitle} headerAction={headerAction}>{children}</Card>; }
