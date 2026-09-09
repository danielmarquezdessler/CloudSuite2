import { ReactNode } from 'react';

type IconName = 'people' | 'map' | 'cal' | 'bell' | 'pin' | 'target' | 'check' | 'clock' | 'gear' | 'home' | 'bars' | 'pulse' | 'list' | 'doc' | 'award' | 'search' | 'chevron-down' | 'chevron-right' | 'plus' | 'help' | 'trend' | 'pie' | 'info';

const paths: Record<IconName, ReactNode> = {
  people: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M3 18.5c0-2.9 2.7-4.6 6-4.6s6 1.7 6 4.6" /><path d="M16.2 14.4c2.9 0 4.8 1.5 4.8 4.1" /></>,
  map: <><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></>,
  bell: <><path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5z" /><path d="M13.7 19.5a2 2 0 0 1-3.4 0" /></>,
  pin: <><circle cx="12" cy="10" r="2.8" /><path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 1 0-13 0c0 5 6.5 11 6.5 11z" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r=".8" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8.3 12.3l2.6 2.6L16 9.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M4.7 12c0-.6.1-1.1.2-1.7l-2-1.5 2-3.4 2.3 1c.8-.8 1.8-1.3 2.9-1.7l.4-2.5h4l.4 2.5c1.1.3 2 .9 2.9 1.7l2.3-1 2 3.4-2 1.5c.1.6.2 1.1.2 1.7s-.1 1.1-.2 1.7l2 1.5-2 3.4-2.3-1c-.8.8-1.8 1.3-2.9 1.7l-.4 2.5h-4l-.4-2.5c-1.1-.3-2-.9-2.9-1.7l-2.3 1-2-3.4 2-1.5c-.1-.6-.2-1.1-.2-1.7z" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5V20a.5.5 0 0 1-.5.5h-15A.5.5 0 0 1 4 20z" /><path d="M9.5 20.5v-6h5v6" /></>,
  bars: <><path d="M6 19v-6M12 19V6M18 19v-9" /></>,
  pulse: <path d="M3 12.5h4l2.5-6.5 4 13 2.5-6.5H21" />,
  list: <><path d="M4.5 7h15M4.5 12h15M4.5 17h15" /></>,
  doc: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M9.5 12h6M9.5 16h4" /></>,
  award: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 5.5H4.5V7A3.5 3.5 0 0 0 8 10.5M17 5.5h2.5V7A3.5 3.5 0 0 1 16 10.5M12 14v3M8.5 20h7l-.7-3h-5.6z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  help: <><path d="M8.8 8.6a3.4 3.4 0 1 1 4.6 3.2c-1 .4-1.5 1.2-1.5 2.2v.5" /><path d="M12 18.6v.2" /></>,
  trend: <><path d="M4 15.5l5-5 3.5 3.5L20 7" /><path d="M15.5 7H20v4.5" /></>,
  pie: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v8.5l6 4.2" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10v5M12 7.5v.2" /></>
};

export function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 1.85, className }: { name: IconName; size?: number; color?: string; strokeWidth?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Mountain() {
  return <svg className="cd-hero__mountain" viewBox="0 0 620 170" preserveAspectRatio="none" aria-hidden="true"><path d="M0 170 L130 116 L185 136 L270 72 L320 104 L400 48 L470 112 L540 84 L620 170 Z" fill="#cfe0fb" /><path d="M190 170 L330 96 L400 48 L470 112 L510 92 L600 170 Z" fill="#bad3f8" /><path d="M372 70 L400 48 L432 88 L414 80 L396 92 L382 82 Z" fill="#fff" opacity=".92" /><path d="M400 48 L400 12" stroke="#8bb2ee" strokeWidth="3" /><path d="M401 12 L434 22 L401 32 Z" fill="#6b9cee" /></svg>;
}
