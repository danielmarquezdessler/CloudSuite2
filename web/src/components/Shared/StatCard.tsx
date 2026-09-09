import { ReactNode } from 'react';
import KpiCard from './KpiCard';
import { Icon } from './Icons';
type Theme = 'blue' | 'green' | 'red' | 'orange' | 'purple';
const iconMap: Record<string, Parameters<typeof Icon>[0]['name']> = { users: 'people', 'check-circle': 'check', 'x-circle': 'help', 'help-circle': 'help', 'trending-up': 'trend', 'pie-chart': 'pie', award: 'award', map: 'map', target: 'target', calendar: 'cal' };
export default function StatCard({ icon, iconColor = 'blue', value, label, caption, captionColor, progress, linkText, onLinkClick }: { icon: string; iconColor?: Theme; value: ReactNode; label: string; caption?: string; captionColor?: string; progress?: number; linkText?: string; onLinkClick?: () => void }) { return <KpiCard icon={iconMap[icon] || 'bars'} iconColor={iconColor} value={value} label={label} caption={caption} captionColor={captionColor} progress={progress} linkText={linkText} onLinkClick={onLinkClick} />; }
