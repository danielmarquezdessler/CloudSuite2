import { useMemo, useState } from 'react';
import { authenticatedFetch, useAuthenticatedQuery } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export type TreoCatalog = { id: string; name: string };
type Props = { base: string | null; kind: 'costCenters' | 'stages' | 'activities' | 'paymentMethods'; label: string; valueId?: string; valueName?: string; onChange: (value: { id: string; name: string }) => void; allowEmpty?: boolean };
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
export default function CatalogSelect({ base, kind, label, valueId = '', valueName = '', onChange, allowEmpty = true }: Props) {
  const { user } = useAuth(); const query = useAuthenticatedQuery<TreoCatalog[]>(user, base ? `${base}/spend/catalogs/${kind}` : null, [base, kind]); const [open, setOpen] = useState(false); const [term, setTerm] = useState(valueName);
  const options = useMemo(() => (query.data ?? []).filter((item) => normalize(item.name).includes(normalize(term))), [query.data, term]); const exact = (query.data ?? []).find((item) => normalize(item.name) === normalize(term));
  const pick = (item: TreoCatalog) => { onChange(item); setTerm(item.name); setOpen(false); };
  const create = async () => { if (!user || !base || !term.trim()) return; const item = await authenticatedFetch<TreoCatalog>(user, `${base}/spend/catalogs/${kind}`, { method: 'POST', body: JSON.stringify({ name: term }) }); pick(item); };
  return <label className="treo-catalog-select">{label}<div className="treo-catalog-select__control"><input className="form-control" value={term} placeholder={`Buscar o crear ${label.toLocaleLowerCase('es-AR')}`} onFocus={() => setOpen(true)} onChange={(event) => { setTerm(event.target.value); setOpen(true); if (!event.target.value) onChange({ id: '', name: '' }); }} aria-expanded={open} aria-label={label} />{open && <div className="treo-catalog-select__menu" role="listbox">{allowEmpty && <button type="button" className="treo-catalog-select__option" onMouseDown={(event) => event.preventDefault()} onClick={() => pick({ id: '', name: '' })}>Sin asignar</button>}{options.map((item) => <button type="button" key={item.id} className={`treo-catalog-select__option${item.id === valueId ? ' is-selected' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(item)}>{item.name}</button>)}{term.trim() && !exact && <button type="button" className="treo-catalog-select__create" onMouseDown={(event) => event.preventDefault()} onClick={create}>Crear “{term.trim()}”</button>}</div>}</div></label>;
}
