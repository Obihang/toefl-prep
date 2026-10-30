import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { applyCursorPreference } from './utils/cursorPreferences';
import { scrubSentryEvent, redactSensitiveInfo } from './utils/redact';
import './index.css';

// Apply custom pointer cursor for clickable points
applyCursorPreference();

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.VITE_SENTRY_DSN) {
      import('@sentry/react')
        .then((Sentry) => {
          Sentry.captureException(error, {
            extra: { componentStack: errorInfo.componentStack },
          });
        })
        .catch(() => {});
    }
  }

  handleCopyDetails = () => {
    const { error } = this.state;
    const rawDetails = error ? `${error.name}: ${error.message}\n${error.stack || ''}` : 'Unknown error';
    const cleanDetails = redactSensitiveInfo(rawDetails);
    navigator.clipboard?.writeText(cleanDetails).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (this.state.hasError) {
      const isSentryEnabled = Boolean(process.env.VITE_SENTRY_DSN);

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-lg font-bold text-slate-900">Application Error</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {isSentryEnabled
                ? 'A fatal error occurred. The developer has been notified.'
                : 'Something went wrong. Reload the page and try again.'}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleCopyDetails}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors cursor-pointer"
              >
                {this.state.copied ? 'Copied Details!' : 'Copy Error Details'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Render root immediately
const rootElement = document.getElementById('root')!;
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);

// Initialize Sentry after first render via dynamic import to keep initial bundle size lean
const initSentryDeferred = () => {
  const dsn = process.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        release: process.env.VITE_COMMIT_SHA || undefined,
        sendDefaultPii: false,
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        enabled: true,
        ignoreErrors: [
          'ResizeObserver loop completed with undelivered notifications',
          'ResizeObserver loop limit exceeded',
          'Failed to fetch',
          'NetworkError',
          'Load failed',
          'AbortError',
        ],
        beforeSend(event) {
          return scrubSentryEvent(event);
        },
      });
    })
    .catch((err) => {
      console.warn('Deferred Sentry initialization skipped:', err);
    });
};

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => initSentryDeferred());
  } else {
    setTimeout(initSentryDeferred, 100);
  }
}
