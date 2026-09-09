import { HTMLAttributes, ReactNode } from 'react';

type StackGap = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type StackProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & { gap?: StackGap; children: ReactNode };

/** Mandatory vertical rhythm for related content inside a card or panel. */
export default function Stack({ gap = 'sm', className = '', children, ...props }: StackProps) {
  return <div className={`cs-stack cs-stack--${gap} ${className}`.trim()} {...props}>{children}</div>;
}
