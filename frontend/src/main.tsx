import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/App';
import { WebSocketProvider } from '@/providers/WebSocketProvider';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebSocketProvider>
      <App />
    </WebSocketProvider>
  </StrictMode>,
);
