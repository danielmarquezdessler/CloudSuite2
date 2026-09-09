import { HTMLAttributes, ReactNode } from 'react';

type InlineGap = 'xs' | 'sm' | 'md' | 'lg';
type InlineProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & { gap?: InlineGap; wrap?: boolean; children: ReactNode };

/** Mandatory horizontal rhythm for actions, badges and compact controls. */
export default function Inline({ gap = 'sm', wrap = false, className = '', children, ...props }: InlineProps) {
  return <div className={`cs-inline cs-inline--${gap}${wrap ? ' cs-inline--wrap' : ''} ${className}`.trim()} {...props}>{children}</div>;
}
