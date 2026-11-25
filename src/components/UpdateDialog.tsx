import { Download } from 'lucide-react';
import { useState } from 'react';
import { downloadAndInstall, openUpdateInBrowser, type UpdateInfo } from '../native/update';
import { Modal } from './Dialogs';

type Phase = 'ask' | 'downloading' | 'installing' | 'error';

/** In-app update: download with progress, then hand off to Android's installer. */
export function UpdateDialog({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('ask');
  const [progress, setProgress] = useState<number | null>(0);

  const start = async () => {
    setPhase('downloading');
    try {
      await downloadAndInstall(info.apkUrl, setProgress);
      setPhase('installing');
    } catch (e) {
      console.error('update failed', e);
      setPhase('error');
    }
  };

  const pct = progress === null ? null : Math.round(progress * 100);

  return (
    <Modal title="גרסה חדשה זמינה" onClose={phase === 'downloading' ? () => {} : onClose}>
      <div className="update">
        <div className="update-icon"><Download size={28} /></div>
        <p>
          גרסה <b>{info.version}</b> זמינה <span className="muted">(מותקנת: {__APP_VERSION__})</span>
        </p>

        {phase === 'downloading' && (
          <>
            <div className={`progress ${pct === null ? 'indeterminate' : ''}`}>
              <div style={{ width: pct === null ? '40%' : `${pct}%` }} />
            </div>
            <p className="muted small-text">{pct === null ? 'מוריד…' : `מוריד… ${pct}%`}</p>
          </>
        )}
        {phase === 'installing' && (
          <p className="muted small-text">
            נפתח מסך ההתקנה — לחץ "עדכן". בפעם הראשונה אנדרואיד יבקש לאשר התקנה מאפליקציה זו: הגדרות ← "אפשר ממקור זה".
          </p>
        )}
        {phase === 'error' && <p className="warn">ההורדה בתוך האפליקציה נכשלה. אפשר להוריד דרך הדפדפן.</p>}
      </div>

      <div className="actions">
        {phase === 'ask' && (
          <>
            <button className="btn primary" onClick={start}>עדכן עכשיו</button>
            <button className="btn" onClick={onClose}>מאוחר יותר</button>
          </>
        )}
        {phase === 'installing' && (
          <>
            <button className="btn primary" onClick={start}>פתח שוב את ההתקנה</button>
            <button className="btn" onClick={onClose}>סגור</button>
          </>
        )}
        {phase === 'error' && (
          <>
            <button className="btn primary" onClick={() => openUpdateInBrowser(info.apkUrl)}>הורדה בדפדפן</button>
            <button className="btn" onClick={onClose}>סגור</button>
          </>
        )}
      </div>
    </Modal>
  );
}
