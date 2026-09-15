import { useState } from 'react';
import Inline from '../../../components/Shared/Inline';
import SelectControl from '../../../components/Shared/SelectControl';

export type PbiCategory = { id: string; name: string; color: string };

export default function PbiCategoryField({ value, categories, onChange, onCreate, disabled = false }: { value: string; categories: PbiCategory[]; onChange: (value: string) => void; onCreate: (name: string) => Promise<PbiCategory>; disabled?: boolean }) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState(''); const [saving, setSaving] = useState(false);
  async function create() { const next = name.trim(); if (!next || saving) return; setSaving(true); try { const category = await onCreate(next); onChange(category.id); setName(''); setCreating(false); } finally { setSaving(false); } }
  return <div className="sp-pbi-category-field"><SelectControl ariaLabel="Categoría del PBI" label="Sin categoría" value={creating ? '__create__' : value} disabled={disabled} onChange={(next) => { if (next === '__create__') setCreating(true); else { setCreating(false); onChange(next); } }} options={[{ value: '', label: 'Sin categoría' }, ...categories.map((category) => ({ value: category.id, label: category.name })), { value: '__create__', label: '+ Crear nueva categoría' }]} />{creating && <Inline gap="sm" className="sp-pbi-category-field__create"><input aria-label="Nombre de nueva categoría" className="form-control" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} placeholder="Nombre de la categoría" autoFocus /><button type="button" className="btn btn-outline-primary" onClick={() => void create()} disabled={!name.trim() || saving}>{saving ? 'Creando…' : `Crear categoría${name.trim() ? ` “${name.trim()}”` : ''}`}</button></Inline>}</div>;
}
