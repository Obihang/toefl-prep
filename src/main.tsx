import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { applyCursorPreference } from './utils/cursorPreferences';
import './index.css';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
  enabled: import.meta.env.PROD && !!import.meta.env.VITE_SENTRY_DSN,
});

// Apply custom pointer cursor for clickable points
applyCursorPreference();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="p-8 text-center text-red-600">A fatal error occurred. The developer has been notified.</div>}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
