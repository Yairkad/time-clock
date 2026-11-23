import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { DialogProvider } from './components/Dialogs';
import { DataProvider } from './data/context';
import { SyncAdapter } from './data/syncAdapter';
import './styles.css';

import { isNative } from './native/platform';

// The Android app ships its files inside the APK; the service worker is for the browser only.
if (!isNative()) registerSW({ immediate: true });

const adapter = new SyncAdapter();
const root = createRoot(document.getElementById('root')!);

adapter
  .init()
  .then(() =>
    root.render(
      <StrictMode>
        <DataProvider adapter={adapter} sync={adapter}>
          <DialogProvider>
            <App />
          </DialogProvider>
        </DataProvider>
      </StrictMode>,
    ),
  )
  .catch((e) => {
    console.error(e);
    root.render(<div className="empty">שגיאה בטעינת הנתונים המקומיים. ייתכן שהדפדפן חוסם אחסון מקומי.</div>);
  });
