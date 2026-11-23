import type { Employer, Settings, Shift, Snapshot } from '../domain/types';

/**
 * Storage boundary used by the UI. The UI never talks to IndexedDB or the cloud
 * directly; a sync-capable implementation can replace the local one later.
 */
export interface DataAdapter {
  init(): Promise<void>;
  /** Current in-memory state, including soft-deleted records. Stable reference until the next change. */
  getSnapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  putEmployers(employers: Employer[]): Promise<void>;
  putShifts(shifts: Shift[]): Promise<void>;
  putSettings(settings: Settings): Promise<void>;
  /** Replace everything (used by backup restore). */
  replaceAll(snapshot: Snapshot): Promise<void>;
}
