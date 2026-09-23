const WAT_OFFSET_MS = 60 * 60 * 1000; // West Africa Time is UTC+1 all year
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Calendar date (YYYY-MM-DD) in WAT. */
export function watDate(d: Date): string {
  return new Date(d.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant (UTC) at which the WAT day containing `d` began. */
export function startOfWatDay(d: Date): Date {
  return new Date(Date.parse(`${watDate(d)}T00:00:00.000Z`) - WAT_OFFSET_MS);
}

/** Whole days from date `a` to date `b` (both YYYY-MM-DD). Negative if b is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "14 Sep 2026" from a YYYY-MM-DD string. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Sat 19 Sep 2026, 14:05 WAT". */
export function formatWatDateTime(d: Date): string {
  const shifted = new Date(d.getTime() + WAT_OFFSET_MS);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[shifted.getUTCDay()]} ${formatDate(shifted.toISOString().slice(0, 10))}, ${hh}:${mm} WAT`;
}
