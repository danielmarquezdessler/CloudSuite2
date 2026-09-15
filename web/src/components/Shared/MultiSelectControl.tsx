import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icons';
import DropdownPortal from './DropdownPortal';

type Option = { value: string; label: string };
type Props = { label: string; value: string[]; onChange: (value: string[]) => void; options: Option[]; ariaLabel?: string; className?: string };

/** Canonical multi-select companion for filter controls. */
export default function MultiSelectControl({ label, value, onChange, options, ariaLabel, className = '' }: Props) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedLabel = useMemo(() => value.length ? `${label} · ${value.length}` : label, [label, value.length]);
  const toggle = (next: string) => onChange(value.includes(next) ? value.filter((item) => item !== next) : [...value, next]);
  return <div className={`cd-select-dropdown${show ? ' is-open' : ''}`}><span className="cd-select-dropdown__toggle"><button ref={triggerRef} type="button" className={`cd-select-control ${className}`} aria-label={ariaLabel ?? label} aria-expanded={show} aria-haspopup="listbox" data-select-control onClick={() => setShow((current) => !current)}><span>{selectedLabel}</span><span className={`cd-select-control__chevron${show ? ' is-open' : ''}`}><Icon name="chevron-down" size={14} color="#6b86ad" strokeWidth={2.2} /></span></button></span><DropdownPortal open={show} anchorRef={triggerRef} onDismiss={() => setShow(false)} className="cs-multi-select__menu">{options.map((option) => <label key={option.value} className="cs-multi-select__option"><input type="checkbox" checked={value.includes(option.value)} onChange={() => toggle(option.value)} />{option.label}</label>)}</DropdownPortal></div>;
}
