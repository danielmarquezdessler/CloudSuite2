import { useState } from 'react';
import Inline from '../../../components/Shared/Inline';
import SelectControl from '../../../components/Shared/SelectControl';

export type SmartPlannerArea = { id: string; name: string; description?: string; color: string };

export default function SmartPlannerAreaField({ value, areas, onChange, onCreate, disabled = false }: { value: string; areas: SmartPlannerArea[]; onChange: (value: string) => void; onCreate: (name: string) => Promise<SmartPlannerArea>; disabled?: boolean }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    const nextName = name.trim();
    if (!nextName || saving) return;
    setSaving(true);
    try {
      const area = await onCreate(nextName);
      onChange(area.id);
      setName('');
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  return <div className="sp-pbi-category-field"><SelectControl ariaLabel="Área del PBI" label="Área" value={creating ? '__create_area__' : value} disabled={disabled} onChange={(next) => { if (next === '__create_area__') setCreating(true); else { setCreating(false); onChange(next); } }} options={[...areas.map((area) => ({ value: area.id, label: area.name })), { value: '__create_area__', label: '+ Crear nueva área' }]} />{creating && <Inline gap="sm" className="sp-pbi-category-field__create"><input aria-label="Nombre de nueva área" className="form-control" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} placeholder="Nombre del área" autoFocus /><button type="button" className="btn btn-outline-primary" onClick={() => void create()} disabled={!name.trim() || saving}>{saving ? 'Creando…' : `Crear área${name.trim() ? ` “${name.trim()}”` : ''}`}</button></Inline>}</div>;
}
