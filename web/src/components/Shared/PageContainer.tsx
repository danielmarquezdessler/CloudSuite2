import { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import BackButton from './BackButton';

type PageContainerProps = PropsWithChildren<{ className?: string; backTo?: string; backLabel?: string }>;

/**
 * The only layout wrapper for authenticated application pages.
 * Its padding is the CloudSuite page rhythm: 20px top, 40px sides and 24px bottom.
 */
export default function PageContainer({ children, className = '', backTo, backLabel }: PageContainerProps) {
  const location = useLocation();
  const resolvedBackTo = backTo ?? (location.pathname.startsWith('/smartplanner/') ? '/smartplanner' : undefined);
  return <div className={`cs-page-container cs-page ${className}`.trim()}><div className="cs-page-container__content">{children}</div>{resolvedBackTo && <div className="cs-page-container__back" data-back-button="page"><BackButton to={resolvedBackTo} label={backLabel ?? 'Volver a SmartPlanner'} /></div>}</div>;
}
