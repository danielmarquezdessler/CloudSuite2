import { ReactNode, useEffect } from 'react';

export function Toast({ message, variant = 'success', onClose }: { message: ReactNode; variant?: 'success' | 'danger' | 'info'; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 4000); return () => window.clearTimeout(timer); }, [onClose]);
  return <div className={`alert alert-${variant} shadow position-fixed bottom-0 end-0 m-4 z-3`} role="status" style={{ maxWidth: 360 }}>{message}<button className="btn-close float-end" aria-label="Cerrar" onClick={onClose} /></div>;
}

