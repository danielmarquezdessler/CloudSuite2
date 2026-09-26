import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const scrollableLayoutContainers = () => Array.from(document.querySelectorAll<HTMLElement>('.pc-container, .pc-content, main, [data-scroll-container]'))
  .filter((element) => element.scrollHeight > element.clientHeight + 1);

/** Resets every application-level scroll surface for forward SPA navigation. */
export default function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {

    const resetScroll = () => {
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      scrollableLayoutContainers().forEach((container) => { container.scrollTop = 0; });
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    // The browser can apply its own same-document restoration after React has
    // committed the new route. Reset once more immediately afterwards.
    const afterRestoration = window.setTimeout(resetScroll, 120);
    // Route data can resize the page after the committed view; this prevents
    // scroll anchoring from restoring an old position during that short phase.
    const afterLayout = window.setTimeout(resetScroll, 400);
    const root = document.getElementById('root');
    const observer = root ? new MutationObserver(resetScroll) : null;
    if (root && observer) observer.observe(root, { childList: true, subtree: true });
    const stopObserving = window.setTimeout(() => observer?.disconnect(), 1_000);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(afterRestoration); window.clearTimeout(afterLayout); window.clearTimeout(stopObserving); observer?.disconnect(); };
  }, [location.pathname, location.search]);

  return null;
}
