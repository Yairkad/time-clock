import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { DataAdapter } from './adapter';
import { TimeClockService } from './service';
import type { SyncAdapter } from './syncAdapter';

interface Ctx {
  adapter: DataAdapter;
  service: TimeClockService;
  sync: SyncAdapter | null;
}

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ adapter, sync = null, children }: { adapter: DataAdapter; sync?: SyncAdapter | null; children: ReactNode }) {
  const [ctx] = useState(() => ({ adapter, sync, service: new TimeClockService(adapter) }));
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

const noopSub = () => () => {};
const disabled = { state: 'disabled', email: null, pending: 0, lastSyncAt: null, error: null } as const;

/** Cloud sync engine and its live status. */
export function useSync() {
  const ctx = useContext(DataContext);
  const sync = ctx?.sync ?? null;
  const status = useSyncExternalStore(
    sync ? sync.subscribeStatus.bind(sync) : noopSub,
    () => (sync ? sync.getStatus() : disabled),
  );
  return { sync, status };
}
