import { ReactNode, RefObject, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Position = { top: number; left: number; width: number; maxHeight: number };

/**
 * Renders a floating menu at document level so parent overflow/stacking contexts
 * can never crop a canonical select menu.
 */
export default function DropdownPortal({ open, anchorRef, onDismiss, className = '', children }: { open: boolean; anchorRef: RefObject<HTMLElement>; onDismiss: () => void; className?: string; children: ReactNode }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [menu, setMenu] = useState<HTMLDivElement | null>(null);
  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const availableAbove = rect.top - 12;
    const placeAbove = availableBelow < 160 && availableAbove > availableBelow;
    const maxHeight = Math.max(96, Math.min(220, placeAbove ? availableAbove : availableBelow));
    setPosition({ top: placeAbove ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 8)), width: rect.width, maxHeight });
  };

  useLayoutEffect(() => { if (!open) return; updatePosition(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => { if (!menu?.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node)) onDismiss(); };
    const dismissEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDismiss(); } };
    const reposition = () => updatePosition();
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissEscape, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => { document.removeEventListener('pointerdown', dismissOutside, true); document.removeEventListener('keydown', dismissEscape, true); window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [menu, onDismiss, open]);
  if (!open || !position || typeof document === 'undefined') return null;
  const root = document.getElementById('dropdown-portal-root') ?? document.body;
  const modalLayer = anchorRef.current?.closest('.modal') ? ' is-in-modal' : '';
  return createPortal(<div ref={setMenu} className={`cd-select-dropdown__menu cd-select-dropdown__portal-menu${modalLayer} ${className}`.trim()} data-dropdown-portal role="listbox" style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}>{children}</div>, root);
}
