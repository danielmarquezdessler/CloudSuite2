import { ReactNode, useEffect } from 'react';
import Inline from './Shared/Inline';
import Stack from './Shared/Stack';
import { Icon } from './Shared/Icons';

type ToastVariant = 'success' | 'info' | 'warning' | 'error' | 'danger';

const variants: Record<ToastVariant, { icon: Parameters<typeof Icon>[0]['name']; label: string }> = {
  success: { icon: 'check', label: 'Confirmación' },
  info: { icon: 'info', label: 'Información' },
  warning: { icon: 'warning', label: 'Advertencia' },
  error: { icon: 'alert', label: 'Error' },
  danger: { icon: 'alert', label: 'Error' }
};

export function Toast({ message, title, description, variant = 'success', onClose, autoCloseMs = 4000 }: { message?: ReactNode; title?: ReactNode; description?: ReactNode; variant?: ToastVariant; onClose: () => void; autoCloseMs?: number }) {
  const config = variants[variant]; const resolvedTitle = title ?? message ?? config.label;
  useEffect(() => { const timer = window.setTimeout(onClose, autoCloseMs); return () => window.clearTimeout(timer); }, [autoCloseMs, onClose]);
  return <div className={`cd-toast cd-toast--${variant} position-fixed top-0 end-0 m-4`} role={variant === 'danger' || variant === 'error' ? 'alert' : 'status'} aria-live="polite">
    <Inline gap="sm" className="cd-toast__content"><span className="cd-toast__icon"><Icon name={config.icon} size={20} strokeWidth={2.2} /></span><Stack gap="xs" className="cd-toast__copy"><strong>{resolvedTitle}</strong>{description && <span>{description}</span>}</Stack><button type="button" className="cd-toast__close" aria-label="Cerrar notificación" onClick={onClose}><Icon name="close" size={16} strokeWidth={2.3} /></button></Inline>
  </div>;
}
