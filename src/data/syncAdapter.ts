import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL, USERNAME_DOMAIN, cloudConfigured } from '../config';
import type { Employer, Settings, Shift, Snapshot } from '../domain/types';
import type { DataAdapter } from './adapter';
import { LocalAdapter } from './localAdapter';

interface SyncMeta {
  /** The account the local data is linked to. */
  userId: string | null;
  /** server_updated_at cursor (ISO). */
  cursor: string | null;
  dirtyEmployers: string[];
  dirtyShifts: string[];
  lastSyncAt: number | null;
}

export type SyncState = 'disabled' | 'signed-out' | 'offline' | 'syncing' | 'synced' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** Display name: the username (or the email, for real email accounts). */
  email: string | null;
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
}

const META_KEY = 'sync';
const emptyMeta = (): SyncMeta => ({ userId: null, cursor: null, dirtyEmployers: [], dirtyShifts: [], lastSyncAt: null });
const PAGE = 1000;
/** Re-read a small window behind the cursor so late commits are not missed (merge is idempotent). */
const CURSOR_OVERLAP_MS = 10_000;

// ---- Row mapping ----
type EmployerRow = {
  id: string; user_id?: string; name: string; employee_name: string; rates: Employer['rates'];
  created_at: number; updated_at: number; deleted: boolean; server_updated_at?: string;
};
type ShiftRow = {
  id: string; user_id?: string; employer_id: string; start_ms: number; end_ms: number | null; rate: number;
  note: string | null; created_at: number; updated_at: number; deleted: boolean; server_updated_at?: string;
};

const employerToRow = (e: Employer, userId: string): EmployerRow => ({
  id: e.id, user_id: userId, name: e.name, employee_name: e.employeeName, rates: e.rates,
  created_at: e.createdAt, updated_at: e.updatedAt, deleted: e.deleted,
});
const rowToEmployer = (r: EmployerRow): Employer => ({
  id: r.id, name: r.name, employeeName: r.employee_name, rates: r.rates ?? [],
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), deleted: r.deleted,
});
const shiftToRow = (s: Shift, userId: string): ShiftRow => ({
  id: s.id, user_id: userId, employer_id: s.employerId, start_ms: s.start, end_ms: s.end, rate: s.rate,
  note: s.note ?? null, created_at: s.createdAt, updated_at: s.updatedAt, deleted: s.deleted,
});
const rowToShift = (r: ShiftRow): Shift => ({
  id: r.id, employerId: r.employer_id, start: Number(r.start_ms), end: r.end_ms === null ? null : Number(r.end_ms),
  rate: Number(r.rate), note: r.note ?? undefined,
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), deleted: r.deleted,
});

/** Keep whichever version was written last. */
function newer<T extends { updatedAt: number }>(local: T | undefined, remote: T): boolean {
  return !local || remote.updatedAt > local.updatedAt;
}

/**
 * Offline-first adapter: every write goes to local storage immediately and is
 * queued; the queue is pushed to Supabase whenever a session and network exist.
 */
export class SyncAdapter implements DataAdapter {
  readonly local = new LocalAdapter();
  readonly client: SupabaseClient | null = cloudConfigured()
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

  private meta: SyncMeta = emptyMeta();
  private session: Session | null = null;
  private status: SyncStatus = { state: 'disabled', email: null, pending: 0, lastSyncAt: null, error: null };
  private statusListeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private channel: RealtimeChannel | null = null;

  async init() {
    await this.local.init();
    this.meta = { ...emptyMeta(), ...(await this.local.getMeta<SyncMeta>(META_KEY)) };
    if (!this.client) return this.setStatus({ state: 'disabled' });

    const { data } = await this.client.auth.getSession();
    await this.onSession(data.session);
    this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Defer: Supabase forbids awaiting its own calls inside this callback.
        setTimeout(() => void this.onSession(session), 0);
      }
    });

    window.addEventListener('online', () => this.sync());
    window.addEventListener('offline', () => this.refreshState());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.sync());
    setInterval(() => this.sync(), 60_000);
  }

  // ---- DataAdapter ----
  getSnapshot() {
    return this.local.getSnapshot();
  }
  subscribe(l: () => void) {
    return this.local.subscribe(l);
  }
  async putEmployers(employers: Employer[]) {
    await this.local.putEmployers(employers);
    await this.markDirty(employers.map((e) => e.id), []);
  }
  async putShifts(shifts: Shift[]) {
    await this.local.putShifts(shifts);
    await this.markDirty([], shifts.map((s) => s.id));
  }
  async putSettings(settings: Settings) {
    // Settings (active employer etc.) stay per device.
    await this.local.putSettings(settings);
  }
  /** Restore from backup: imported records win, and records missing from the backup are deleted everywhere. */
  async replaceAll(snapshot: Snapshot) {
    const now = Date.now();
    const cur = this.local.getSnapshot();
    const empIds = new Set(snapshot.employers.map((e) => e.id));
    const shiftIds = new Set(snapshot.shifts.map((s) => s.id));
    const employers = [
      ...snapshot.employers.map((e) => ({ ...e, updatedAt: now })),
      ...cur.employers.filter((e) => !empIds.has(e.id)).map((e) => ({ ...e, deleted: true, updatedAt: now })),
    ];
    const shifts = [
      ...snapshot.shifts.map((s) => ({ ...s, updatedAt: now })),
      ...cur.shifts.filter((s) => !shiftIds.has(s.id)).map((s) => ({ ...s, deleted: true, updatedAt: now })),
    ];
    await this.local.replaceAll({ employers, shifts, settings: snapshot.settings });
    await this.markDirty(employers.map((e) => e.id), shifts.map((s) => s.id));
  }

  // ---- Status ----
  getStatus() {
    return this.status;
  }
  subscribeStatus(l: () => void) {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }
  private setStatus(patch: Partial<SyncStatus>) {
    this.status = {
      ...this.status,
      pending: this.meta.dirtyEmployers.length + this.meta.dirtyShifts.length,
      lastSyncAt: this.meta.lastSyncAt,
      email: displayName(this.session?.user.email),
      ...patch,
    };
    this.statusListeners.forEach((l) => l());
  }
  private refreshState() {
    if (!this.client) return this.setStatus({ state: 'disabled' });
    if (!this.session) return this.setStatus({ state: 'signed-out' });
    if (!navigator.onLine) return this.setStatus({ state: 'offline' });
  }

  // ---- Auth ----
  async signIn(username: string, password: string) {
    if (!this.client) throw new Error('הענן לא מוגדר');
    const { error } = await this.client.auth.signInWithPassword({ email: toAuthEmail(username), password });
    if (error) throw new Error(authMessage(error.message));
  }
  /** Returns true if the user must confirm their email first. */
  async signUp(username: string, password: string): Promise<boolean> {
    if (!this.client) throw new Error('הענן לא מוגדר');
    const { data, error } = await this.client.auth.signUp({ email: toAuthEmail(username), password });
    if (error) throw new Error(authMessage(error.message));
    return !data.session;
  }
  /** Signs out; optionally wipes this device's data. */
  async signOut(clearLocal: boolean) {
    await this.client?.auth.signOut();
    if (clearLocal) {
      await this.local.replaceAll({ employers: [], shifts: [], settings: { ...this.local.getSnapshot().settings, activeEmployerId: null } });
      this.meta = emptyMeta();
      await this.saveMeta();
    }
  }

  /** Account the local data is linked to, if different from `userId`. */
  linkedToOtherAccount(userId: string) {
    return !!this.meta.userId && this.meta.userId !== userId;
  }

  private async onSession(session: Session | null) {
    this.session = session;
    this.channel && (await this.client?.removeChannel(this.channel));
    this.channel = null;
    if (!session) return this.refreshState();

    const uid = session.user.id;
    if (this.meta.userId !== uid) {
      const s = this.local.getSnapshot();
      if (this.meta.userId) {
        // Local data belonged to a different account: drop it, then load this account.
        await this.local.replaceAll({ employers: [], shifts: [], settings: { ...s.settings, activeEmployerId: null } });
        this.meta = { ...emptyMeta(), userId: uid };
      } else {
        // First login on this device: upload everything recorded so far.
        this.meta = {
          ...emptyMeta(),
          userId: uid,
          dirtyEmployers: s.employers.map((e) => e.id),
          dirtyShifts: s.shifts.map((x) => x.id),
        };
      }
      await this.saveMeta();
    }
    this.channel = this.client!
      .channel('tc-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employers', filter: `user_id=eq.${uid}` }, () => this.sync(300))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `user_id=eq.${uid}` }, () => this.sync(300))
      .subscribe();
    this.sync();
  }

  // ---- Sync ----
  private async saveMeta() {
    await this.local.putMeta(META_KEY, this.meta);
  }

  private async markDirty(employerIds: string[], shiftIds: string[]) {
    this.meta.dirtyEmployers = [...new Set([...this.meta.dirtyEmployers, ...employerIds])];
    this.meta.dirtyShifts = [...new Set([...this.meta.dirtyShifts, ...shiftIds])];
    await this.saveMeta();
    this.setStatus({});
    this.sync(500);
  }

  /** Schedule a sync (debounced). Safe to call often. */
  sync(delay = 0) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.runSync(), delay);
  }

  private async runSync() {
    if (this.running) {
      this.again = true;
      return;
    }
    if (!this.client || !this.session || !navigator.onLine) return this.refreshState();
    this.setStatus({ state: 'syncing', error: null });
    this.running = (async () => {
      try {
        await this.push();
        await this.pull();
        this.meta.lastSyncAt = Date.now();
        await this.saveMeta();
        this.setStatus({ state: 'synced' });
      } catch (e) {
        console.error('sync failed', e);
        this.setStatus({ state: navigator.onLine ? 'error' : 'offline', error: (e as Error).message });
      }
    })();
    await this.running;
    this.running = null;
    if (this.again) {
      this.again = false;
      this.sync(200);
    }
  }

  private async push() {
    const uid = this.meta.userId!;
    const snap = this.local.getSnapshot();
    const empIds = [...this.meta.dirtyEmployers];
    const shiftIds = [...this.meta.dirtyShifts];
    const employers = snap.employers.filter((e) => empIds.includes(e.id));
    const shifts = snap.shifts.filter((s) => shiftIds.includes(s.id));
    // Employers first: shifts reference them.
    for (let i = 0; i < employers.length; i += PAGE) {
      const { error } = await this.client!.from('employers').upsert(employers.slice(i, i + PAGE).map((e) => employerToRow(e, uid)));
      if (error) throw error;
    }
    for (let i = 0; i < shifts.length; i += PAGE) {
      const { error } = await this.client!.from('shifts').upsert(shifts.slice(i, i + PAGE).map((s) => shiftToRow(s, uid)));
      if (error) throw error;
    }
    // Only clear what was pushed; edits made meanwhile stay queued.
    const pushedE = new Map(employers.map((e) => [e.id, e.updatedAt]));
    const pushedS = new Map(shifts.map((s) => [s.id, s.updatedAt]));
    const now = this.local.getSnapshot();
    this.meta.dirtyEmployers = this.meta.dirtyEmployers.filter(
      (id) => pushedE.get(id) !== now.employers.find((e) => e.id === id)?.updatedAt,
    );
    this.meta.dirtyShifts = this.meta.dirtyShifts.filter(
      (id) => pushedS.get(id) !== now.shifts.find((s) => s.id === id)?.updatedAt,
    );
    await this.saveMeta();
  }

  private async pullTable<R extends { server_updated_at?: string }>(table: string, since: string | null): Promise<{ rows: R[]; max: string | null }> {
    const rows: R[] = [];
    let max: string | null = null;
    for (let from = 0; ; from += PAGE) {
      let q = this.client!.from(table).select('*').order('server_updated_at').order('id').range(from, from + PAGE - 1);
      if (since) q = q.gt('server_updated_at', since);
      const { data, error } = await q;
      if (error) throw error;
      rows.push(...(data as R[]));
      if (data.length) max = (data[data.length - 1] as R).server_updated_at ?? max;
      if (data.length < PAGE) break;
    }
    return { rows, max };
  }

  private async pull() {
    const since = this.meta.cursor ? new Date(new Date(this.meta.cursor).getTime() - CURSOR_OVERLAP_MS).toISOString() : null;
    const [emp, sh] = await Promise.all([
      this.pullTable<EmployerRow>('employers', since),
      this.pullTable<ShiftRow>('shifts', since),
    ]);
    const snap = this.local.getSnapshot();
    const localE = new Map(snap.employers.map((e) => [e.id, e]));
    const localS = new Map(snap.shifts.map((s) => [s.id, s]));
    const employers = emp.rows.map(rowToEmployer).filter((e) => newer(localE.get(e.id), e));
    const shifts = sh.rows.map(rowToShift).filter((s) => newer(localS.get(s.id), s));
    // Write straight to local storage: remote changes must not be re-queued.
    if (employers.length) await this.local.putEmployers(employers);
    if (shifts.length) await this.local.putShifts(shifts);

    const maxes = [this.meta.cursor, emp.max, sh.max].filter(Boolean) as string[];
    this.meta.cursor = maxes.sort().at(-1) ?? null;

    // Make sure the active employer still exists.
    const settings = this.local.getSnapshot().settings;
    const alive = this.local.getSnapshot().employers.filter((e) => !e.deleted);
    if (!alive.some((e) => e.id === settings.activeEmployerId) && alive.length) {
      await this.local.putSettings({ ...settings, activeEmployerId: alive[0].id, updatedAt: Date.now() });
    }
  }
}

/** Accepts a username (English letters, digits, . _ -) or a full email address. */
export function toAuthEmail(input: string): string {
  const v = input.trim().toLowerCase();
  if (v.includes('@')) return v;
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(v)) {
    throw new Error('שם משתמש: 2–30 תווים באנגלית, ספרות או . _ -');
  }
  return `${v}@${USERNAME_DOMAIN}`;
}

function displayName(email: string | undefined): string | null {
  if (!email) return null;
  const suffix = '@' + USERNAME_DOMAIN;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

function authMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'שם משתמש או סיסמה שגויים';
  if (m.includes('email not confirmed')) return 'יש לכבות את "Confirm email" בהגדרות Supabase';
  if (m.includes('already registered')) return 'שם המשתמש תפוס — יש להתחבר או לבחור שם אחר';
  if (m.includes('password should be')) return 'הסיסמה חייבת להכיל לפחות 6 תווים';
  if (m.includes('rate limit')) return 'יותר מדי ניסיונות, נסה שוב מאוחר יותר';
  if (m.includes('fetch')) return 'אין חיבור לשרת';
  if (m.includes('signups not allowed')) return 'ההרשמה סגורה בהגדרות Supabase';
  return msg;
}
