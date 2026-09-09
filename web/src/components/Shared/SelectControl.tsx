import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Icon } from './Icons';

type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectControlProps = {
  label: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  className?: string;
  children?: ReactNode;
  id?: string;
  name?: string;
  ariaLabel?: string;
  options?: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
};

export default function SelectControl({ label, icon, className = '', children, id, name, ariaLabel, options, value, defaultValue, onChange, disabled = false }: SelectControlProps) {
  const [show, setShow] = useState(false);
  const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? options?.[0]?.value ?? '');
  const selectedValue = value ?? internalValue;
  const selectedLabel = useMemo(() => options?.find((option) => option.value === selectedValue)?.label ?? label, [label, options, selectedValue]);
  useEffect(() => { if (value !== undefined) setInternalValue(value); else if (defaultValue !== undefined) setInternalValue(defaultValue); }, [defaultValue, value]);
  const trigger = <button id={id} type="button" className={'cd-select-control ' + className} aria-label={ariaLabel ?? label} aria-expanded={show} disabled={disabled}>{icon && <Icon name={icon} size={16} color="#2f6fe4" strokeWidth={2} />}<span>{selectedLabel}</span>{children}<span className={'cd-select-control__chevron' + (show ? ' is-open' : '')}><Icon name="chevron-down" size={14} color="#6b86ad" strokeWidth={2.2} /></span></button>;
  if (!options) return trigger;

  const choose = (nextValue: string) => { setInternalValue(nextValue); onChange?.(nextValue); setShow(false); };
  return <Dropdown className="cd-select-dropdown" show={show} onToggle={(nextShow) => setShow(nextShow)} drop="down">
    <Dropdown.Toggle as="span" className="cd-select-dropdown__toggle">{trigger}</Dropdown.Toggle>
    {name && <input type="hidden" name={name} value={selectedValue} />}
    <Dropdown.Menu
      className="cd-select-dropdown__menu"
      popperConfig={{ modifiers: [{ name: 'flip', options: { fallbackPlacements: ['top-start'], padding: 12 } }] }}
    >
      {options.map((option) => <Dropdown.Item key={option.value} active={option.value === selectedValue} disabled={option.disabled} onClick={() => choose(option.value)}>{option.label}</Dropdown.Item>)}
    </Dropdown.Menu>
  </Dropdown>;
}
