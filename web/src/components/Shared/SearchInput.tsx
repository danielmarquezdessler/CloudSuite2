import { InputHTMLAttributes } from 'react';
import { Icon } from './Icons';

export default function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <label className={'cd-search-input ' + className}><Icon name="search" size={16} color="#9aafc9" strokeWidth={2} /><input type="search" {...props} /></label>;
}
