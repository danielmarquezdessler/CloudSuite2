import { ReactNode, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Icon } from './Icons';

type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectControlProps = {
  label: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  className?: string;
  children?: ReactNode;
  id?: string;
  ariaLabel?: string;
  options?: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
};

export default function SelectControl({ label, icon, className = '', children, id, ariaLabel, options, value, onChange, disabled = false }: SelectControlProps) {
  const [show, setShow] = useState(false);
  const trigger = <button id={id} type="button" className={'cd-select-control ' + className} aria-label={ariaLabel ?? label} disabled={disabled}>{icon && <Icon name={icon} size={16} color="#2f6fe4" strokeWidth={2} />}<span>{label}</span>{children}<Icon name="chevron-down" size={14} color="#6b86ad" strokeWidth={2.2} /></button>;
  if (!options) return trigger;

  return <Dropdown className="cd-select-dropdown" show={show} onToggle={(nextShow) => setShow(nextShow)} drop="down">
    <Dropdown.Toggle as="span" className="cd-select-dropdown__toggle">{trigger}</Dropdown.Toggle>
    <Dropdown.Menu
      className="cd-select-dropdown__menu"
      popperConfig={{ modifiers: [{ name: 'flip', options: { fallbackPlacements: ['top-start'], padding: 12 } }] }}
    >
      {options.map((option) => <Dropdown.Item key={option.value} active={option.value === value} disabled={option.disabled} onClick={() => { onChange?.(option.value); setShow(false); }}>{option.label}</Dropdown.Item>)}
    </Dropdown.Menu>
  </Dropdown>;
}
