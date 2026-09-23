"use client";

import { useRef, useState, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: TabDef[];
  defaultTabId: string;
  onSelect?: (id: string) => void;
}

/**
 * Standard WAI-ARIA tabs pattern. Every panel stays in the DOM (toggled via the `hidden`
 * attribute, never conditionally unmounted) so page content is not lost to crawlers, screen
 * readers without full JS support, or anyone who just wants Ctrl+F to find something.
 */
export function Tabs({ tabs, defaultTabId, onSelect }: Props) {
  const [active, setActive] = useState(defaultTabId);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    setActive(id);
    onSelect?.(id);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next =
      e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "Home" ? 0 : tabs.length - 1;
    const nextTab = tabs[next];
    select(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Guide sections" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {tabs.map((tab, i) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                isActive ? "border border-accent bg-accent-soft text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={tab.id !== active} className="mt-3">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
