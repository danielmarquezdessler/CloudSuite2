import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icons';

export default function PrimaryButton({ icon, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: Parameters<typeof Icon>[0]['name']; children: ReactNode }) {
  return <button className={'cd-primary-button ' + className} {...props}>{icon && <Icon name={icon} size={17} color="#fff" strokeWidth={2} />}{children}</button>;
}
