import { useEffect, useState } from 'react';
import { SyncBadge } from './components/SyncPanel';
import { useData } from './data/context';
import { Employers } from './screens/Employers';
import { Home } from './screens/Home';
import { Journal } from './screens/Journal';
import { Reports } from './screens/Reports';
import { Settings } from './screens/Settings';

const TABS = [
  { id: 'home', label: 'ראשי', icon: '⏱️' },
  { id: 'journal', label: 'יומן', icon: '📅' },
  { id: 'reports', label: 'דוחות', icon: '📊' },
  { id: 'employers', label: 'מעבידים', icon: '🏢' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
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
            aria-label="מעביד פעיל"
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
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'home' && <Home goEmployers={() => go('employers')} />}
        {tab === 'journal' && <Journal />}
        {tab === 'reports' && <Reports />}
        {tab === 'employers' && <Employers autoOpen />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
