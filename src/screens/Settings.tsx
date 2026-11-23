import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDialogs } from '../components/Dialogs';
import { SyncPanel } from '../components/SyncPanel';
import { Employers } from './Employers';
import { useData } from '../data/context';
import { download } from '../export/report';

export function Settings() {
  const { service } = useData();
  const { confirm, toast } = useDialogs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(service.settings().defaultEmployeeName);

  const exportBackup = () => {
    const b = service.exportBackup();
    const stamp = b.exportedAt.slice(0, 16).replace(/[:T]/g, '-');
    download(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), `time-clock-backup_${stamp}.json`);
  };

  const importBackup = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast('הקובץ אינו JSON תקין', 'error');
    }
    const d = (data as { data?: { employers?: unknown[]; shifts?: unknown[] } })?.data;
    const ok = await confirm({
      title: 'שחזור מגיבוי',
      message: (
        <>
          <p>כל הנתונים הנוכחיים במכשיר יוחלפו בנתוני הגיבוי.</p>
          {d && <p>הגיבוי כולל {d.employers?.length ?? 0} מעסיקים ו־{d.shifts?.length ?? 0} רישומים.</p>}
        </>
      ),
      checkboxLabel: 'אני מבין/ה שהנתונים הנוכחיים יוחלפו',
      confirmText: 'שחזור',
      danger: true,
    });
    if (!ok) return;
    try {
      await service.importBackup(data);
      toast('הנתונים שוחזרו');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="settings">
      <h2>הגדרות</h2>

      <Employers />

      <section className="card" id="sync">
        <h3>חשבון וסנכרון</h3>
        <SyncPanel />
      </section>

      <section className="card">
        <h3>כללי</h3>
        <label>
          שם עובד ברירת מחדל (למעסיקים חדשים)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => service.updateSettings({ defaultEmployeeName: name.trim() })}
          />
        </label>
      </section>

      <section className="card">
        <h3>גיבוי ושחזור</h3>
        <p className="muted small-text">קובץ JSON הכולל מעסיקים, תעריפים, היסטוריית שעות, רישום פעיל והגדרות.</p>
        <div className="export-buttons">
          <button className="btn primary" onClick={exportBackup}><Download size={18} /> ייצוא גיבוי</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={18} /> ייבוא גיבוי</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importBackup(f);
          }}
        />
      </section>


      <p className="muted small-text center">גרסה {__APP_VERSION__}</p>
    </div>
  );
}
