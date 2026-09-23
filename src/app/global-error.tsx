"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
// global-error replaces the entire root layout (including its <html>/<body>) when it activates,
// so layout.tsx's import of this file never runs here — without this, the color variables the
// classes below rely on would be undefined.
import "./globals.css";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-canvas text-ink">
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 px-4 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted">Please refresh the page. If this keeps happening, try again shortly.</p>
        </main>
      </body>
    </html>
  );
}
