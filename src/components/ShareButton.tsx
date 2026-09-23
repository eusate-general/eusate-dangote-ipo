"use client";

import { track } from "@/lib/client/track";

interface Props {
  text: string;
  className?: string;
}

/** WhatsApp is how this spreads in Nigeria (PLAN.md section 7); falls back to any Web Share target. */
export function ShareButton({ text, className }: Props) {
  const onClick = async () => {
    const url = window.location.href;
    track("share_click", { method: "share" in navigator ? "web_share" : "whatsapp" });
    if ("share" in navigator) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        // user cancelled, or the platform rejected it - fall through to the WhatsApp link
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={className ?? "inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-sm hover:border-accent"}
    >
      <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.2-1.36a9.95 9.95 0 0 0 4.84 1.23h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.83 14.24c-.25.7-1.24 1.28-2.02 1.45-.55.12-1.26.21-3.67-.79-2.98-1.24-4.9-4.26-5.05-4.46-.15-.2-1.2-1.6-1.2-3.05 0-1.46.75-2.17 1.02-2.47.27-.3.58-.37.78-.37.2 0 .39 0 .56.01.18.01.42-.07.65.5.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.13 1.01 2.09 1.32 2.39 1.47.3.15.47.13.65-.08.17-.2.75-.87.95-1.17.2-.3.4-.25.65-.15.27.1 1.7.8 1.99.94.3.15.49.22.56.35.08.13.08.75-.18 1.45Z" />
      </svg>
      Share
    </button>
  );
}
