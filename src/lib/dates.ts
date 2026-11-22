/** Accepts "2024-01-05 09:31:00", "20240105;093100", "2024-01-05, 09:31:00", "01/05/2024 9:31". */
export function parseDate(dateStr: string, timeStr = ''): string | null {
  let s = `${dateStr ?? ''} ${timeStr ?? ''}`.trim().replace(/[,;]/g, ' ').replace(/\s+/g, ' ');
  let m = s.match(/^(\d{4})(\d{2})(\d{2})(?: (\d{2}):?(\d{2}):?(\d{2})?)?/);
  if (m) {
    s = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i))) {
    let h = parseInt(m[4] ?? '0', 10);
    if (m[7]?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (m[7]?.toUpperCase() === 'AM' && h === 12) h = 0;
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    s = `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
  } else {
    s = s.replace(' ', 'T');
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // Keep local wall-clock time of the exchange; store without timezone conversion.
  return s.length >= 19 ? s.slice(0, 19) : d.toISOString().slice(0, 19);
}
