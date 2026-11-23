import { CalendarDays, Clock, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SyncBadge } from './components/SyncPanel';
import { useDialogs } from './components/Dialogs';
import { useData } from './data/context';
import { toTimeStr } from './domain/calc';
import { syncActiveNotification } from './native/notifications';
import { checkForUpdate, openUpdate } from './native/update';
import { Home } from './screens/Home';
import { Journal } from './screens/Journal';
import { Settings } from './screens/Settings';

const TABS = [
  { id: 'home', label: 'ראשי', Icon: Clock },
  { id: 'journal', label: 'יומן', Icon: CalendarDays },
  { id: 'settings', label: 'הגדרות', Icon: SettingsIcon },
] as const;
type Tab = (typeof TABS)[number]['id'];

const fromHash = (): Tab => {
  const h = location.hash.slice(1);
  return (TABS.some((t) => t.id === h) ? h : 'home') as Tab;
};

export function App() {
  const { service } = useData();
  const [tab, setTab] = useState<Tab>(fromHash);
  const employers = service.employers();
  const activeId = service.employer(service.settings().activeEmployerId)?.id ?? employers[0]?.id ?? '';
  const active = service.activeShift();

  const { confirm } = useDialogs();
  const activeEmployerName = active ? service.employer(active.employerId)?.name ?? '' : '';

  // Persistent "at work" notification (Android app).
  useEffect(() => {
    void syncActiveNotification(active ? { employerName: activeEmployerName, startLabel: toTimeStr(active.start) } : null);
  }, [active?.id, active?.start, activeEmployerName]);

  // Check GitHub Releases for a newer APK once per launch.
  useEffect(() => {
    void checkForUpdate().then(async (u) => {
      if (!u) return;
      const ok = await confirm({
        title: 'גרסה חדשה זמינה',
        message: `גרסה ${u.version} זמינה (מותקנת: ${__APP_VERSION__}).`,
        confirmText: 'עדכן עכשיו',
        cancelText: 'מאוחר יותר',
      });
      if (ok) await openUpdate(u.apkUrl);
    });
  }, [confirm]);

  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    location.hash = t;
    setTab(t);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          שעון נוכחות <SyncBadge onClick={() => go('settings')} />
        </div>
        {employers.length > 0 && (
          <select
            className="employer-select"
            value={activeId}
            aria-label="מעסיק פעיל"
            onChange={(e) => service.updateSettings({ activeEmployerId: e.target.value })}
          >
            {employers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{active?.employerId === e.id ? ' ●' : ''}
              </option>
            ))}
          </select>
        )}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
            <t.Icon className="tab-icon" size={22} strokeWidth={t.id === tab ? 2.4 : 1.8} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'home' && <Home goEmployers={() => go('settings')} />}
        {tab === 'journal' && <Journal />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
