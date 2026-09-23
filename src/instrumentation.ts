import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Errors from Server Components, Route Handlers and the proxy. A no-op without a DSN, same as
// the init files above.
export const onRequestError = Sentry.captureRequestError;
