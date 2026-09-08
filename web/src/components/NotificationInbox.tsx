import { useEffect, useMemo, useState } from 'react';
import { Badge, Dropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch } from '../lib/api';

type NotificationItem = { id: string; title: string; message: string; read: boolean; createdAt: string | null; metadata?: { voterId?: string; path?: string } };
const relativeTime = (value: string | null) => { if (!value) return 'recién'; const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 1 ? 'recién' : minutes < 60 ? `hace ${minutes} min` : minutes < 1440 ? `hace ${Math.round(minutes / 60)} h` : `hace ${Math.round(minutes / 1440)} d`; };

export default function NotificationInbox() {
  const { user } = useAuth(); const navigate = useNavigate(); const [items, setItems] = useState<NotificationItem[]>([]);
  const load = async () => { if (!user) return; try { setItems(await authenticatedFetch(user, `/api/users/${user.uid}/notifications`) as NotificationItem[]); } catch { setItems([]); } };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60000); return () => window.clearInterval(timer); }, [user]);
  const unread = useMemo(() => items.filter(item => !item.read).length, [items]);
  const open = async (item: NotificationItem) => { if (user && !item.read) { await authenticatedFetch(user, `/api/users/${user.uid}/notifications/${item.id}/read`, { method: 'PUT' }); setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read: true } : entry)); } navigate(item.metadata?.path ?? (item.metadata?.voterId ? `/visit/${item.metadata.voterId}` : '/notifications')); };
  return <Dropdown as="li" className="pc-h-item" onToggle={(open) => { if (open) void load(); }}>
    <Dropdown.Toggle as="a" className="pc-head-link arrow-none me-0" href="#" aria-label="Notificaciones"><i className="ph-duotone ph-bell" />{unread > 0 && <Badge bg="danger" pill className="pc-h-badge">{unread}</Badge>}</Dropdown.Toggle>
    <Dropdown.Menu className="dropdown-menu-end pc-h-dropdown p-0" style={{ width: 360 }}><div className="p-3 border-bottom d-flex justify-content-between"><strong>Notificaciones</strong><small className="text-muted">{unread} sin leer</small></div><div style={{ maxHeight: 380, overflowY: 'auto' }}>{items.slice(0, 10).map(item => <button type="button" key={item.id} className={`list-group-item list-group-item-action text-start ${item.read ? '' : 'bg-light-primary'}`} onClick={() => void open(item)}><div className="d-flex gap-2"><i className="ph-duotone ph-bell-ringing mt-1" /><div><strong className="d-block">{item.title}</strong><span className="small text-muted d-block">{item.message}</span><small className="text-muted">{relativeTime(item.createdAt)}</small></div></div></button>)}{items.length === 0 && <p className="text-muted p-3 mb-0">No tenés notificaciones todavía.</p>}</div><button type="button" className="btn btn-link w-100 py-2" onClick={() => navigate('/notifications')}>Ver todas</button></Dropdown.Menu>
  </Dropdown>;
}

