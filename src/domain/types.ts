/** Fields shared by every synced record. */
export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete marker, so deletions can be synced. */
  deleted: boolean;
}

export interface RateEntry {
  /** Effective from this date (YYYY-MM-DD), inclusive. */
  from: string;
  rate: number;
}

export interface Employer extends BaseRecord {
  name: string;
  employeeName: string;
  /** Rate history, sorted ascending by `from`. */
  rates: RateEntry[];
}

export interface Shift extends BaseRecord {
  employerId: string;
  /** Epoch ms. */
  start: number;
  /** Epoch ms, or null while the shift is active. */
  end: number | null;
  /** The hourly rate frozen for this shift. */
  rate: number;
  note?: string;
}

export interface Settings {
  activeEmployerId: string | null;
  defaultEmployeeName: string;
  updatedAt: number;
}

export interface Snapshot {
  employers: Employer[];
  shifts: Shift[];
  settings: Settings;
}

export interface BackupFile {
  app: 'time-clock';
  version: 1;
  exportedAt: string;
  data: Snapshot;
}

export interface Period {
  /** YYYY-MM-DD inclusive */
  from: string;
  /** YYYY-MM-DD inclusive */
  to: string;
}
