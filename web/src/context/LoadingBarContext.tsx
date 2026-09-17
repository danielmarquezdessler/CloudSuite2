import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

type LoadingBarContextValue = {
  beginLoading: () => () => void;
};

const LoadingBarContext = createContext<LoadingBarContextValue | undefined>(undefined);

/**
 * Global loading feedback for route changes and asynchronous page data.
 * `beginLoading` returns an idempotent cleanup function so concurrent requests
 * keep the bar active until the final request has completed.
 */
export function LoadingBarProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pendingOperations = useRef(new Set<symbol>());
  const hideTimer = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [completing, setCompleting] = useState(false);

  const beginLoading = useCallback(() => {
    const operation = Symbol('cloudsuite-loading');
    pendingOperations.current.add(operation);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setCompleting(false);
    setVisible(true);

    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      pendingOperations.current.delete(operation);
      if (pendingOperations.current.size) return;
      setCompleting(true);
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        setCompleting(false);
        hideTimer.current = null;
      }, 220);
    };
  }, []);

  // BrowserRouter does not expose a pending-navigation state. Keeping the bar
  // visible briefly after each committed location gives every navigation the
  // same immediate, non-blocking feedback as data-driven loads.
  useEffect(() => {
    const finish = beginLoading();
    const timer = window.setTimeout(finish, 360);
    return () => {
      window.clearTimeout(timer);
      finish();
    };
  }, [beginLoading, location.key, location.pathname, location.search]);

  useEffect(() => () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
  }, []);

  return <LoadingBarContext.Provider value={{ beginLoading }}>
    <div
      aria-hidden={!visible}
      className={`cs-global-loading-bar${visible ? ' is-active' : ''}${completing ? ' is-completing' : ''}`}
      data-global-loading-bar
      data-loading-state={visible ? (completing ? 'completing' : 'loading') : 'idle'}
      role="progressbar"
    ><span /></div>
    {children}
  </LoadingBarContext.Provider>;
}

export function useLoadingBar() {
  const context = useContext(LoadingBarContext);
  if (!context) throw new Error('useLoadingBar debe usarse dentro de LoadingBarProvider.');
  return context;
}
