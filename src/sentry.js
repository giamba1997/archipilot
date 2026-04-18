import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    // Performance monitoring: sample 20% of transactions
    tracesSampleRate: 0.2,
    // Session replay: capture 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Don't send PII by default
    sendDefaultPii: false,
    // Filter out non-critical errors
    beforeSend(event) {
      // Ignore ResizeObserver loop errors (harmless browser noise)
      if (event.exception?.values?.[0]?.value?.includes("ResizeObserver")) {
        return null;
      }
      return event;
    },
  });
}

export { Sentry };
