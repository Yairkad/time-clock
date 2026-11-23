import { openDB, type IDBPDatabase } from 'idb';
import type { Employer, Settings, Shift, Snapshot } from '../domain/types';
import type { DataAdapter } from './adapter';

const DB_NAME = 'time-clock';
const DB_VERSION = 1;
const SETTINGS_KEY = 'settings';

export const defaultSettings = (): Settings => ({
  activeEmployerId: null,
  defaultEmployeeName: '',
  updatedAt: 0,
});

/** Offline-first local storage on IndexedDB, with an in-memory mirror. */
export class LocalAdapter implements DataAdapter {
  private db!: IDBPDatabase;
  private snapshot: Snapshot = { employers: [], shifts: [], settings: defaultSettings() };
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('time-clock') : null;

  async init() {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('employers', { keyPath: 'id' });
        const shifts = db.createObjectStore('shifts', { keyPath: 'id' });
        shifts.createIndex('employerId', 'employerId');
        db.createObjectStore('meta');
      },
    });
    await this.reload();
    // Other tabs changed data: reload.
    this.channel?.addEventListener('message', () => void this.reload());
    // Ask the browser not to evict our data.
    void navigator.storage?.persist?.();
  }

  private async reload() {
    const [employers, shifts, settings] = await Promise.all([
      this.db.getAll('employers') as Promise<Employer[]>,
      this.db.getAll('shifts') as Promise<Shift[]>,
      this.db.get('meta', SETTINGS_KEY) as Promise<Settings | undefined>,
    ]);
    this.snapshot = { employers, shifts, settings: { ...defaultSettings(), ...settings } };
    this.emit(false);
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(broadcast = true) {
    this.listeners.forEach((l) => l());
    if (broadcast) this.channel?.postMessage('changed');
  }

  private merge<T extends { id: string }>(list: T[], items: T[]): T[] {
    const map = new Map(list.map((x) => [x.id, x]));
    for (const i of items) map.set(i.id, i);
    return [...map.values()];
  }

  async putEmployers(employers: Employer[]) {
    const tx = this.db.transaction('employers', 'readwrite');
    await Promise.all([...employers.map((e) => tx.store.put(e)), tx.done]);
    this.snapshot = { ...this.snapshot, employers: this.merge(this.snapshot.employers, employers) };
    this.emit();
  }

  async putShifts(shifts: Shift[]) {
    const tx = this.db.transaction('shifts', 'readwrite');
    await Promise.all([...shifts.map((s) => tx.store.put(s)), tx.done]);
    this.snapshot = { ...this.snapshot, shifts: this.merge(this.snapshot.shifts, shifts) };
    this.emit();
  }

  async putSettings(settings: Settings) {
    await this.db.put('meta', settings, SETTINGS_KEY);
    this.snapshot = { ...this.snapshot, settings };
    this.emit();
  }

  async replaceAll(snapshot: Snapshot) {
    const tx = this.db.transaction(['employers', 'shifts', 'meta'], 'readwrite');
    const emp = tx.objectStore('employers');
    const sh = tx.objectStore('shifts');
    await Promise.all([emp.clear(), sh.clear()]);
    await Promise.all([
      ...snapshot.employers.map((e) => emp.put(e)),
      ...snapshot.shifts.map((s) => sh.put(s)),
      tx.objectStore('meta').put(snapshot.settings, SETTINGS_KEY),
      tx.done,
    ]);
    this.snapshot = snapshot;
    this.emit();
  }
}
