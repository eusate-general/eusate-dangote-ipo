"use client";

import type { ReactNode } from "react";
import { track, type ClientEvent } from "@/lib/client/track";

interface Props {
  href: string;
  event: ClientEvent;
  props?: Record<string, string>;
  className?: string;
  children: ReactNode;
}

export function TrackedLink({ href, event, props, className, children }: Props) {
  const fire = () => track(event, props);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={fire}
      onAuxClick={fire}
    >
      {children}
    </a>
  );
}
