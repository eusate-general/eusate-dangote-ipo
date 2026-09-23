"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/client/track";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

/** Registers the static-asset service worker and offers install only when the browser signals it can. */
function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function PwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // Lazy initializer only: the component renders null until `deferred` is set regardless of this
  // value, so reading localStorage here (client-only, after hydration would have painted null
  // either way) carries no hydration-mismatch risk.
  const [dismissed, setDismissed] = useState(wasDismissed);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // localStorage can throw in a private window; the banner just reappears next visit
    }
  };

  const install = async () => {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    track("pwa_install_prompt", { outcome });
    setDeferred(null);
    if (outcome === "dismissed") dismiss();
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 shadow-lg sm:inset-x-auto sm:right-4 sm:w-80">
      <p className="text-sm">Install this guide for quick access.</p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={dismiss} className="rounded-lg px-2 py-1 text-sm text-muted">
          Not now
        </button>
        <button type="button" onClick={install} className="rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-sm font-semibold text-ink">
          Install
        </button>
      </div>
    </div>
  );
}
