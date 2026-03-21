import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log("[Sentry] No DSN configured — monitoring disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE, // "development" | "production"
    release: `ezdrive-supervision@${import.meta.env.VITE_APP_VERSION ?? "2.0.0"}`,

    // Performance monitoring
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

    // Session replay for error reproduction
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,

    // Only send errors in production by default
    enabled: import.meta.env.PROD || !!SENTRY_DSN,

    // Filter out noisy errors
    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
      "Network request failed",
      "Load failed",
      "Failed to fetch",
    ],

    beforeSend(event) {
      // Strip PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => {
          if (b.category === "xhr" || b.category === "fetch") {
            // Remove auth tokens from URLs
            if (b.data?.url) {
              b.data.url = (b.data.url as string).replace(/token=[^&]+/g, "token=***");
            }
          }
          return b;
        });
      }
      return event;
    },
  });
}

export { Sentry };
