import { HTMLAttributes, ReactNode } from 'react';

type InlineGap = 'xs' | 'sm' | 'md' | 'lg';
type InlineProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & { gap?: InlineGap; wrap?: boolean; align?: 'start' | 'center' | 'end'; children: ReactNode };

/** Mandatory horizontal rhythm for actions, badges and compact controls. */
export default function Inline({ gap = 'sm', wrap = false, align = 'center', className = '', children, ...props }: InlineProps) {
  return <div className={`cs-inline cs-inline--${gap} cs-inline--align-${align}${wrap ? ' cs-inline--wrap' : ''} ${className}`.trim()} {...props}>{children}</div>;
}
