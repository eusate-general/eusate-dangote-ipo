export function formatNgn(n: number): string {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${grouped}${dec ? `.${dec}` : ""}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** 4100000000 -> "4.1 billion". */
export function formatBig(n: number): string {
  if (n >= 1e12) return `${trim(n / 1e12)} trillion`;
  if (n >= 1e9) return `${trim(n / 1e9)} billion`;
  if (n >= 1e6) return `${trim(n / 1e6)} million`;
  return n.toLocaleString("en-US");
}
