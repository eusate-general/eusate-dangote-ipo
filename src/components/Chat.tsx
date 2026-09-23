"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { linkifyCitations, type SourceEntry } from "@/lib/catalog";
import { track } from "@/lib/client/track";
import { getTurnstileToken } from "@/lib/client/turnstile";
import { createSseParser } from "@/lib/sse";
import { Markdown } from "./Markdown";

const MAX_CHARS = 500;
const STICK_THRESHOLD_PX = 80;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  error?: string;
  rateable?: boolean;
  feedback?: "up" | "down";
}

interface Props {
  catalog: SourceEntry[];
  suggestions: string[];
  greeting: string;
}

function chatErrorMessage(status: number): string {
  if (status === 400 || status === 413) return "That message couldn't be sent. Try shortening it.";
  if (status === 429) return "You're sending messages a bit fast. Please wait a moment and try again.";
  if (status === 403) return "That couldn't be verified as a real visitor. Please refresh the page and try again.";
  return "The guide is unavailable right now. Please try again shortly.";
}

function sourceLabel(s: SourceEntry): string {
  switch (s.kind) {
    case "fact":
      return s.status === "confirmed" ? "checked by Eusate" : "press report";
    case "platform":
      return s.status === "official" ? "official list" : s.status === "reported" ? "named in press" : "unconfirmed";
    case "guide":
      return "guide";
    case "eusate":
      return "Eusate";
    default:
      return "news";
  }
}

export function Chat({ catalog, suggestions, greeting }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "greeting", role: "assistant", text: greeting }]);
  const [extraSources, setExtraSources] = useState<SourceEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const openedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);

  const byId = useMemo(
    () => new Map<string, SourceEntry>([...catalog, ...extraSources].map((s) => [s.id, s])),
    [catalog, extraSources],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const markOpened = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    track("chat_open");
  }, []);

  const patch = useCallback((id: string, change: (m: ChatMessage) => ChatMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? change(m) : m)));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busyRef.current) return;
      markOpened();
      busyRef.current = true;
      setBusy(true);
      setInput("");
      stickRef.current = true;

      let assistantId: string = crypto.randomUUID();
      const userId = crypto.randomUUID();
      setMessages((ms) => [
        ...ms,
        { id: userId, role: "user", text },
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      let finished = false;

      const fail = (message: string, restore: boolean) => {
        finished = true;
        setMessages((ms) => ms.map((m) => (m.id === assistantId ? { ...m, streaming: false, error: message } : m)));
        if (restore) setInput(text);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId: conversationIdRef.current,
            turnstileToken: getTurnstileToken(),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          fail(chatErrorMessage(res.status), true);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parse = createSseParser();

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const ev of parse(decoder.decode(value, { stream: true }))) {
            if (ev.event === "meta") {
              conversationIdRef.current = ev.data.conversationId;
              const previousId = assistantId;
              assistantId = ev.data.messageId;
              patch(previousId, (m) => ({ ...m, id: ev.data.messageId }));
              if (ev.data.sources.length > 0) {
                setExtraSources((prev) => [...prev, ...ev.data.sources]);
              }
            } else if (ev.event === "delta") {
              patch(assistantId, (m) => ({ ...m, text: m.text + ev.data.text }));
            } else if (ev.event === "done") {
              finished = true;
              patch(assistantId, (m) => ({ ...m, streaming: false, rateable: true }));
            } else if (ev.event === "error") {
              fail(ev.data.message, ev.data.code === "engine");
            }
          }
        }
        if (!finished) fail("The connection dropped. Please try again.", true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          fail("Couldn't reach the guide. Check your connection and try again.", true);
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [markOpened, patch],
  );

  const rate = (id: string, value: "up" | "down") => {
    patch(id, (m) => ({ ...m, feedback: value }));
    track("feedback", { messageId: id, value });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  const hasUserMessage = messages.some((m) => m.role === "user");

  return (
    <section aria-label="Ask the guide" className="rounded-2xl border border-line bg-surface shadow-sm">
      <div
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        className="max-h-[60dvh] min-h-40 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.map((m) => (
          <Message key={m.id} m={m} byId={byId} onRate={rate} />
        ))}
      </div>

      {!hasUserMessage && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => void send(q)}
              className="rounded-full border border-line bg-canvas px-3 py-1.5 text-sm text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-line p-3">
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          value={input}
          rows={1}
          maxLength={MAX_CHARS}
          placeholder="Ask about the IPO"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={markOpened}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="h-11 rounded-xl border border-accent bg-accent-soft px-4 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <p className="px-4 pb-3 text-xs text-muted">
        {input.length > 400 ? `${input.length}/${MAX_CHARS} characters. ` : ""}
        Unofficial and not investment advice. Never share your BVN, card details or OTPs here.
      </p>
    </section>
  );
}

function Message({
  m,
  byId,
  onRate,
}: {
  m: ChatMessage;
  byId: ReadonlyMap<string, SourceEntry>;
  onRate: (id: string, value: "up" | "down") => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-accent bg-accent-soft px-3.5 py-2.5 text-[0.95rem] text-ink">
          {m.text}
        </p>
      </div>
    );
  }

  const { markdown, cited } = linkifyCitations(m.text, byId);

  return (
    <div className="flex">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-canvas px-3.5 py-2.5 text-[0.95rem]">
        {m.streaming && m.text === "" ? (
          <span className="typing" role="status" aria-label="The guide is typing">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <Markdown text={markdown} />
        )}

        {m.error && (
          <p role="alert" className="mt-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-sm text-warn">
            {m.error}
          </p>
        )}

        {!m.streaming && cited.length > 0 && (
          <ol className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-muted">
            {cited.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-1.5">
                <span className="font-semibold text-ink">[{i + 1}]</span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                    {s.title}
                  </a>
                ) : (
                  <span>{s.title}</span>
                )}
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-ink">{sourceLabel(s)}</span>
              </li>
            ))}
          </ol>
        )}

        {m.rateable && (
          <div className="mt-2 flex items-center gap-1 text-muted">
            <span className="mr-1 text-xs">Helpful?</span>
            {(["up", "down"] as const).map((v) => (
              <button
                key={v}
                type="button"
                disabled={m.feedback !== undefined}
                aria-label={v === "up" ? "Good answer" : "Bad answer"}
                aria-pressed={m.feedback === v}
                onClick={() => onRate(m.id, v)}
                className={`rounded-md border px-2 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-accent ${
                  m.feedback === v ? "border-accent bg-accent-soft text-ink" : "border-line"
                } disabled:opacity-60`}
              >
                {v === "up" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
