export const money = (v: number, digits = 2) =>
  (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)} %`;

export const num = (v: number, digits = 2) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: digits }) : '∞';

export const pnlClass = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export function duration(min: number): string {
  if (!min) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 1440) return `${(min / 60).toFixed(1)} h`;
  return `${(min / 1440).toFixed(1)} d`;
}

export const dt = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');
