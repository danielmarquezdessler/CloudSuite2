import { KeyboardEvent, useId, useState } from 'react';
import Inline from './Inline';

type Props = { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; id?: string; label?: string; placeholder?: string; disabled?: boolean };
const canonical = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Free-form campaign tags with keyboard creation and reusable campaign suggestions. */
export default function TagInput({ value, onChange, suggestions = [], id, label = 'Tags', placeholder = 'Escribí un tag y presioná Enter', disabled = false }: Props) {
  const generatedId = useId(); const inputId = id ?? `tag-input-${generatedId}`; const listId = `${inputId}-suggestions`;
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const tag = raw.trim(); if (!tag || value.some((item) => canonical(item) === canonical(tag))) { setDraft(''); return; }
    onChange([...value, tag]); setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(draft); } };
  return <div className="cs-tag-input"><label className="form-label" htmlFor={inputId}>{label}</label><Inline gap="xs" wrap className="cs-tag-input__tags">{value.map((tag) => <span key={canonical(tag)} className="cs-tag-input__tag">{tag}<button type="button" aria-label={`Quitar tag ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))} disabled={disabled}>×</button></span>)}</Inline><input id={inputId} className="form-control" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} onBlur={() => draft.trim() && add(draft)} list={listId} placeholder={placeholder} disabled={disabled} /><datalist id={listId}>{suggestions.filter((tag) => !value.some((item) => canonical(item) === canonical(tag))).map((tag) => <option key={canonical(tag)} value={tag} />)}</datalist><small className="text-muted">Presioná Enter para agregar. Usá los tags ya registrados para mantener la base ordenada.</small></div>;
}
