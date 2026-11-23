import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { DialogProvider } from './components/Dialogs';
import { DataProvider } from './data/context';
import { LocalAdapter } from './data/localAdapter';
import './styles.css';

registerSW({ immediate: true });

const adapter = new LocalAdapter();
const root = createRoot(document.getElementById('root')!);

adapter
  .init()
  .then(() =>
    root.render(
      <StrictMode>
        <DataProvider adapter={adapter}>
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
