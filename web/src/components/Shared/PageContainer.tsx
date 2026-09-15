import { HTMLAttributes, PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import BackButton from './BackButton';
import { CommunicationsWidget } from '../../pages/Modules/SmartPlanner/Communications';

type PageContainerProps = PropsWithChildren<HTMLAttributes<HTMLDivElement> & { className?: string; backTo?: string; backLabel?: string }>;

/**
 * The only layout wrapper for authenticated application pages.
 * Its padding is the CloudSuite page rhythm: 20px top, 40px sides and 24px bottom.
 */
export default function PageContainer({ children, className = '', backTo, backLabel, ...props }: PageContainerProps) {
  const location = useLocation();
  const resolvedBackTo = backTo ?? (location.pathname.startsWith('/smartplanner/') ? '/smartplanner' : undefined);
  return <div className={`cs-page-container cs-page ${className}`.trim()} {...props}><div className="cs-page-container__content">{children}</div>{resolvedBackTo && <div className="cs-page-container__back" data-back-button="page"><BackButton to={resolvedBackTo} label={backLabel ?? 'Regresar a inicio'} variant="link" /></div>}<CommunicationsWidget /></div>;
}
