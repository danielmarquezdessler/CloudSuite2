import { Link } from 'react-router-dom';
import { Icon } from './Icons';

type BackButtonProps = {
  to: string;
  label?: string;
  variant?: 'icon' | 'link';
};

/** Shared, accessible return control for contextual sub-pages. */
export default function BackButton({ to, label = 'Volver', variant = 'icon' }: BackButtonProps) {
  return <Link className={`cd-back-button cd-back-button--${variant}`} to={to} aria-label={label} title={label}>
    {variant === 'icon' ? <Icon name="chevron-left" size={19} color="#fff" strokeWidth={2.6} /> : <span aria-hidden="true">‹&nbsp;Regresar a inicio</span>}
  </Link>;
}
