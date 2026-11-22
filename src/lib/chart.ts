import type { Trade } from '../types';

/**
 * Time handling: trade times are stored as wall-clock strings (no timezone) in the timezone the broker
 * reported them in. For the chart we work in "wall seconds" — the wall-clock time interpreted as if it
 * were UTC — so axis labels show the same times as the journal. Real epochs are only used to query data.
 */
export const wallSec = (iso: string) => Date.parse(`${iso.slice(0, 19)}Z`) / 1000;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
/** Offset of `tz` from UTC at the given real epoch, in seconds (wall - utc). */
export function tzOffset(epoch: number, tz: string): number {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(epoch * 1000)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000;
  return asUtc - Math.floor(epoch);
}

export const epochToWall = (epoch: number, tz: string) => epoch + tzOffset(epoch, tz);
export function wallToEpoch(wall: number, tz: string): number {
  let e = wall - tzOffset(wall, tz);
  e = wall - tzOffset(e, tz); // second pass handles DST boundaries
  return e;
}

export type Interval = '1m' | '5m' | '15m' | '1h' | '1d';
export const INTERVAL_SEC: Record<Interval, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };

export interface ChartPlan { interval: Interval; from: number; to: number } // wall seconds

/**
 * Picks the finest bar size the free data source still serves for a trade of this age and length
 * (1m ≈ last 30 days, intraday ≈ last 60 days, 1h ≈ last 2 years) and a window with context around it.
 */
export function planChart(t: Trade, nowWall: number, prefer?: Interval): ChartPlan {
  const open = wallSec(t.openTime);
  const close = t.closeTime ? wallSec(t.closeTime) : nowWall;
  const hold = Math.max(0, close - open);
  const ageDays = (nowWall - open) / 86400;

  let interval: Interval;
  if (ageDays <= 28 && hold <= 3 * 3600) interval = '1m';
  else if (ageDays <= 58 && hold <= 8 * 3600) interval = '5m';
  else if (ageDays <= 58 && hold <= 3 * 86400) interval = '15m';
  else if (ageDays <= 720 && hold <= 25 * 86400) interval = '1h';
  else interval = '1d';
  if (prefer && allowed(prefer, ageDays)) interval = prefer;

  const bar = INTERVAL_SEC[interval];
  const pad = Math.max(hold * 0.6, bar * 90);
  let from = open - pad;
  let to = Math.min(close + pad, nowWall + bar);
  if (interval === '1m' && to - from > 7 * 86400) from = to - 7 * 86400; // source limit per request
  from = Math.floor(from / bar) * bar;
  return { interval, from, to };
}

export function allowed(i: Interval, ageDays: number): boolean {
  if (i === '1m') return ageDays <= 28;
  if (i === '5m' || i === '15m') return ageDays <= 58;
  if (i === '1h') return ageDays <= 720;
  return true;
}

/** Maps a broker symbol to the data source (Yahoo Finance) ticker. */
export function chartSymbol(t: Pick<Trade, 'symbol' | 'assetClass'>): string {
  const s = t.symbol.trim().toUpperCase();
  const a = t.assetClass.toUpperCase();
  const occ = s.replace(/\s+/g, '').match(/^([A-Z]{1,6})(\d{6}[CP]\d{8})$/);
  if (occ) return occ[1] + occ[2];
  if (a.startsWith('FUT')) {
    const root = s.match(/^([A-Z0-9]{1,3}?)[FGHJKMNQUVXZ]\d{1,2}$/)?.[1];
    return `${root ?? s}=F`;
  }
  if (a === 'CASH') return `${s.replace(/[.\/]/g, '')}=X`;
  return s.replace(/[ .\/]/g, '-');
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }

/**
 * Deterministic synthetic candles that pass through the trade's fills.
 * Used for the offline demo data only (account "DEMO"), clearly labelled in the UI.
 */
export function syntheticCandles(t: Trade, plan: ChartPlan): Candle[] {
  let seed = [...t.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bar = INTERVAL_SEC[plan.interval];
  const anchors = t.executions.map((e) => ({ t: wallSec(e.time), p: e.price })).sort((a, b) => a.t - b.t);
  const p0 = anchors[0].p;
  const vol = p0 * 0.0004 * Math.sqrt(bar / 60);
  const pts = [{ t: plan.from, p: p0 * (1 + (rnd() - 0.5) * 0.01) }, ...anchors, { t: plan.to, p: anchors[anchors.length - 1].p * (1 + (rnd() - 0.5) * 0.01) }];

  const out: Candle[] = [];
  let k = 0;
  let prev = pts[0].p;
  for (let x = plan.from; x <= plan.to; x += bar) {
    while (k < pts.length - 2 && pts[k + 1].t <= x) k++;
    const a = pts[k], b = pts[k + 1];
    const f = b.t > a.t ? Math.min(1, Math.max(0, (x - a.t) / (b.t - a.t))) : 0;
    const target = a.p + (b.p - a.p) * f;
    const close = target + (rnd() - 0.5) * vol;
    const open = prev;
    // make sure fills inside this bar lie within its range
    const inBar = anchors.filter((e) => e.t >= x && e.t < x + bar).map((e) => e.p);
    const high = Math.max(open, close, ...inBar) + rnd() * vol * 0.6;
    const low = Math.min(open, close, ...inBar) - rnd() * vol * 0.6;
    out.push({ time: x, open, high, low, close, volume: Math.round(1000 + rnd() * 9000) });
    prev = close;
  }
  return out;
}
