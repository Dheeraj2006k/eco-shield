export const fmtClock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour12: false });
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export function timeAgo(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
export const num = (x: number, d = 0) => x.toFixed(d);

export function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function download(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
