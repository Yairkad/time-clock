import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { DataAdapter } from './adapter';
import { TimeClockService } from './service';

interface Ctx {
  adapter: DataAdapter;
  service: TimeClockService;
}

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ adapter, children }: { adapter: DataAdapter; children: ReactNode }) {
  const [ctx] = useState(() => ({ adapter, service: new TimeClockService(adapter) }));
  return <DataContext.Provider value={ctx}>{children}</DataContext.Provider>;
}

/** Returns the service and re-renders on every data change. */
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('DataProvider missing');
  const snapshot = useSyncExternalStore(ctx.adapter.subscribe.bind(ctx.adapter), () => ctx.adapter.getSnapshot());
  return { service: ctx.service, snapshot };
}

/** Current time, refreshed every `ms`. */
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    // Re-sync immediately when the app returns to the foreground.
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms, enabled]);
  return now;
}

/** The active employer, falling back to the first one. */
export function useActiveEmployer() {
  const { service } = useData();
  const employers = service.employers();
  return service.employer(service.settings().activeEmployerId) ?? employers[0];
}
