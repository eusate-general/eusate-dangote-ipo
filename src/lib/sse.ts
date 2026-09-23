import type { SourceEntry } from "@/lib/catalog";
import type { Phase } from "@/lib/knowledge/schema";

export type ErrorCode = "budget" | "turn_cap" | "engine" | "invalid";

export type ServerEvent =
  | {
      event: "meta";
      data: { conversationId: string; messageId: string; phase: Phase; sources: SourceEntry[] };
    }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { messageId: string } }
  | { event: "error"; data: { code: ErrorCode; message: string } };

export function encodeSse(e: ServerEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

/** Incremental SSE parser for the browser. Feed it chunks; it returns complete events. */
export function createSseParser() {
  let buffer = "";
  return (chunk: string): ServerEvent[] => {
    buffer += chunk;
    const events: ServerEvent[] = [];
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let name = "";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) name = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (name && data) {
        try {
          events.push({ event: name, data: JSON.parse(data) } as ServerEvent);
        } catch {
          // Ignore a malformed frame rather than breaking the stream.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
    return events;
  };
}
