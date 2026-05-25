import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App.js';
import { ThemeProvider } from './components/theme.js';
import { Toaster } from './components/ui/toaster.js';
import './index.css';

Sentry.init({
  dsn: 'https://9e6885602b48dbc6a597efe171125807@o4510942379048960.ingest.us.sentry.io/4511446127345664',
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>,
);
