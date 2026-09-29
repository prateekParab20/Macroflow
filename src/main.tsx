import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installBrowserHistory } from './lib/historyNav';
import { installKeyboardAssist } from './lib/keyboard';
import { StoreProvider } from './state/Store';
import './index.css';

installBrowserHistory();
installKeyboardAssist();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
