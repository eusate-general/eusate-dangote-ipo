import * as Sentry from "@sentry/nextjs";

// A falsy dsn makes the SDK a no-op — this file is always imported, but does nothing until
// NEXT_PUBLIC_SENTRY_DSN is set (see .env.example). No Sentry account exists yet as of writing.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
