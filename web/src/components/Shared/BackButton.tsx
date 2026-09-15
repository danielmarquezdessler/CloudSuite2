import { Link } from 'react-router-dom';
import { Icon } from './Icons';

type BackButtonProps = {
  to: string;
  label?: string;
};

/** Shared, accessible return control for contextual sub-pages. */
export default function BackButton({ to, label = 'Volver' }: BackButtonProps) {
  return <Link className="cd-back-button" to={to} aria-label={label} title={label}><Icon name="chevron-left" size={25} color="#fff" strokeWidth={2.6} /></Link>;
}
