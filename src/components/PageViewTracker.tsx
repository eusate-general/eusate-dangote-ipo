"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/client/track";

export function PageViewTracker() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const params = new URLSearchParams(window.location.search);
    const props: Record<string, string> = { path: window.location.pathname };
    if (document.referrer) props.referrer = document.referrer;
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      const value = params.get(key);
      if (value) props[key] = value;
    }
    track("page_view", props);
  }, []);

  return null;
}
