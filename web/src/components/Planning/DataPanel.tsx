import { ReactNode } from 'react';
import Inline from '../Shared/Inline';
import Stack from '../Shared/Stack';
export default function DataPanel({ title, icon, action, empty, children }: { title?: string; icon?: string; action?: ReactNode; empty?: { icon: string; title: string; description: string; action?: ReactNode }; children?: ReactNode }) { return <section className="planning-panel"><Inline gap="sm" wrap className="planning-panel__header">{title && <h2>{icon && <i className={`ti ti-${icon}`} />} {title}</h2>}{action}</Inline>{children ?? (empty && <Stack gap="md" className="planning-empty"><i className={`ti ti-${empty.icon}`} /><h3>{empty.title}</h3><p>{empty.description}</p>{empty.action}</Stack>)}</section>; }
