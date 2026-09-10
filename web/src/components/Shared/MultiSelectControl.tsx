import { useMemo, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Icon } from './Icons';

type Option = { value: string; label: string };
type Props = { label: string; value: string[]; onChange: (value: string[]) => void; options: Option[]; ariaLabel?: string; className?: string };

/** Canonical multi-select companion for filter controls. */
export default function MultiSelectControl({ label, value, onChange, options, ariaLabel, className = '' }: Props) {
  const [show, setShow] = useState(false);
  const selectedLabel = useMemo(() => value.length ? `${label} · ${value.length}` : label, [label, value.length]);
  const toggle = (next: string) => onChange(value.includes(next) ? value.filter((item) => item !== next) : [...value, next]);
  return <Dropdown className="cd-select-dropdown" show={show} onToggle={setShow} drop="down">
    <Dropdown.Toggle as="span" className="cd-select-dropdown__toggle"><button type="button" className={`cd-select-control ${className}`} aria-label={ariaLabel ?? label} aria-expanded={show}><span>{selectedLabel}</span><span className={`cd-select-control__chevron${show ? ' is-open' : ''}`}><Icon name="chevron-down" size={14} color="#6b86ad" strokeWidth={2.2} /></span></button></Dropdown.Toggle>
    <Dropdown.Menu className="cd-select-dropdown__menu cs-multi-select__menu">{options.map((option) => <Dropdown.Item as="label" key={option.value} className="cs-multi-select__option"><input type="checkbox" checked={value.includes(option.value)} onChange={() => toggle(option.value)} />{option.label}</Dropdown.Item>)}</Dropdown.Menu>
  </Dropdown>;
}
