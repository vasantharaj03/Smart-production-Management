/**
 * Safe replacement for setInterval(fn, ms) when fn calls the API.
 *  - never starts a new run while the previous one is still in flight
 *    (slow server + fixed interval = requests pile up, which is what made
 *     calls show 30-40s in the Network tab)
 *  - skips ticks while the browser tab is hidden
 *  - refreshes immediately when the tab becomes visible again
 * Returns a cleanup function, so it works directly inside useEffect.
 */
export function poll(fn, ms) {
  let running = false;
  const run = async () => {
    if (running || document.hidden) return;
    running = true;
    try { await fn(); } catch { /* callers handle their own errors */ } finally { running = false; }
  };
  const timer = setInterval(run, ms);
  const onVisible = () => { if (!document.hidden) run(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
}
