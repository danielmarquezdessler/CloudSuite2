import { PropsWithChildren } from 'react';

type PageContainerProps = PropsWithChildren<{ className?: string }>;

/**
 * The only layout wrapper for authenticated application pages.
 * Its padding is the CloudSuite page rhythm: 20px top, 40px sides and 24px bottom.
 */
export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return <div className={`cs-page-container cs-page ${className}`.trim()}>{children}</div>;
}
