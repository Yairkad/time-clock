import { useState } from 'react';
import { useSync } from '../data/context';
import { formatDate, toTimeStr } from '../domain/calc';
import { useDialogs } from './Dialogs';

const STATE_LABEL: Record<string, string> = {
  synced: '✅ מסונכרן',
  syncing: '🔄 מסנכרן…',
  offline: '📴 אין אינטרנט — השינויים יסונכרנו כשהחיבור יחזור',
  error: '⚠️ שגיאת סנכרון',
};

export function SyncPanel() {
  const { sync, status } = useSync();
  const { toast, confirm } = useDialogs();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);

  if (!sync || status.state === 'disabled') {
    return <p className="muted small-text">הסנכרון לענן עדיין לא הוגדר. הנתונים נשמרים במכשיר זה בלבד.</p>;
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (status.state === 'signed-out') {
    const submit = () =>
      run(async () => {
        if (!email.trim() || !password) throw new Error('יש למלא מייל וסיסמה');
        if (mode === 'in') {
          await sync.signIn(email.trim(), password);
          toast('התחברת בהצלחה');
        } else if (await sync.signUp(email.trim(), password)) {
          toast('נשלח מייל אימות. יש ללחוץ על הקישור ואז להתחבר.');
          setMode('in');
        }
      });
    return (
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="muted small-text">התחברות מאפשרת סנכרון בין הטלפון למחשב. הנתונים הקיימים במכשיר יועלו לחשבון.</p>
        <div className="segmented">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>התחברות</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>הרשמה</button>
        </div>
        <label>
          מייל
          <input type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          סיסמה
          <input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy}>{busy ? '…' : mode === 'in' ? 'התחברות' : 'יצירת חשבון'}</button>
        {mode === 'in' && (
          <button
            type="button"
            className="link"
            onClick={() =>
              run(async () => {
                if (!email.trim()) throw new Error('יש להזין מייל');
                await sync.resetPassword(email.trim());
                toast('נשלח מייל לאיפוס סיסמה');
              })
            }
          >
            שכחתי סיסמה
          </button>
        )}
      </form>
    );
  }

  const logout = async () => {
    const pendingNote = status.pending > 0 ? ` שים לב: ${status.pending} שינויים עדיין לא סונכרנו ויימחקו.` : '';
    const clear = await confirm({
      title: 'התנתקות',
      message: `למחוק גם את הנתונים מהמכשיר הזה? הנתונים נשמרים בחשבון ויחזרו בהתחברות הבאה.${pendingNote}`,
      confirmText: 'התנתק ומחק מהמכשיר',
      danger: true,
    });
    if (clear) await run(() => sync.signOut(true));
  };

  return (
    <div className="sync-info">
      <div>
        מחובר כ־<b dir="ltr">{status.email}</b>
      </div>
      <div>{STATE_LABEL[status.state] ?? ''}</div>
      {status.error && <div className="muted small-text" dir="ltr">{status.error}</div>}
      {status.pending > 0 && <div className="muted small-text">{status.pending} שינויים ממתינים לסנכרון</div>}
      {status.lastSyncAt && (
        <div className="muted small-text">
          סנכרון אחרון: {formatDate(status.lastSyncAt)} {toTimeStr(status.lastSyncAt)}
        </div>
      )}
      <div className="export-buttons">
        <button className="btn" onClick={() => sync.sync()} disabled={status.state === 'syncing'}>🔄 סנכרן עכשיו</button>
        <button className="btn" onClick={logout}>התנתקות</button>
      </div>
    </div>
  );
}

/** Small cloud indicator for the header. */
export function SyncBadge({ onClick }: { onClick: () => void }) {
  const { status } = useSync();
  if (status.state === 'disabled') return null;
  const icon =
    status.state === 'signed-out' ? '☁️' :
    status.state === 'syncing' ? '🔄' :
    status.state === 'offline' ? '📴' :
    status.state === 'error' ? '⚠️' :
    status.pending > 0 ? '⏳' : '✅';
  const title =
    status.state === 'signed-out' ? 'לא מחובר — לחץ להתחברות' : STATE_LABEL[status.state] ?? '';
  return (
    <button className="sync-badge" onClick={onClick} title={title} aria-label={title}>
      {icon}
    </button>
  );
}
