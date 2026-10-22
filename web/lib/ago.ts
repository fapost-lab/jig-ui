/**
 * How long ago a UTC time was, in the words Jig uses (`jig_utc_ago`): "just now", "12 min ago", "3 h ago",
 * "2 days ago"; empty when the time cannot be read.
 */
export function ago(at: string, now = Date.now()): string {
  const s = Math.floor((now - Date.parse(at)) / 1000);
  if (Number.isNaN(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 172800) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} days ago`;
}
