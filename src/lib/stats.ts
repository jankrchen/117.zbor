import type { Trade, TradeMeta } from '../types';

export interface Stats {
  count: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  expectancy: number;
  payoffRatio: number;
  maxDrawdown: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  avgHoldWin: number;
  avgHoldLoss: number;
  avgR: number | null;
  tradingDays: number;
  greenDays: number;
}

export const closedOnly = (t: Trade[]) => t.filter((x) => !x.isOpen);
export const dayKey = (iso: string) => iso.slice(0, 10);

export function computeStats(trades: Trade[], meta: Record<string, TradeMeta> = {}): Stats {
  const closed = closedOnly(trades).sort((a, b) => (a.closeTime! < b.closeTime! ? -1 : 1));
  const wins = closed.filter((t) => t.netPnl > 0);
  const losses = closed.filter((t) => t.netPnl < 0);
  const sum = (a: Trade[], f: (t: Trade) => number) => a.reduce((s, t) => s + f(t), 0);
  const grossWin = sum(wins, (t) => t.netPnl);
  const grossLoss = -sum(losses, (t) => t.netPnl);
  const netPnl = sum(closed, (t) => t.netPnl);

  let peak = 0, eq = 0, maxDd = 0, cw = 0, cl = 0, mcw = 0, mcl = 0;
  for (const t of closed) {
    eq += t.netPnl;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
    if (t.netPnl > 0) { cw++; cl = 0; } else if (t.netPnl < 0) { cl++; cw = 0; } else { cw = 0; cl = 0; }
    mcw = Math.max(mcw, cw);
    mcl = Math.max(mcl, cl);
  }

  const rs = closed
    .map((t) => (meta[t.id]?.risk ? t.netPnl / meta[t.id].risk! : null))
    .filter((r): r is number => r != null);

  const daily = dailyPnl(closed);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const n = closed.length;

  return {
    count: n,
    wins: wins.length,
    losses: losses.length,
    scratches: n - wins.length - losses.length,
    winRate: n ? wins.length / n : 0,
    netPnl,
    grossPnl: sum(closed, (t) => t.grossPnl),
    fees: sum(closed, (t) => t.fees),
    avgWin,
    avgLoss,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.netPnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.netPnl)) : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
    expectancy: n ? netPnl / n : 0,
    payoffRatio: avgLoss ? avgWin / avgLoss : 0,
    maxDrawdown: maxDd,
    maxConsecWins: mcw,
    maxConsecLosses: mcl,
    avgHoldWin: wins.length ? sum(wins, (t) => t.holdMinutes) / wins.length : 0,
    avgHoldLoss: losses.length ? sum(losses, (t) => t.holdMinutes) / losses.length : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    tradingDays: daily.length,
    greenDays: daily.filter((d) => d.pnl > 0).length,
  };
}

export interface DailyPoint { date: string; pnl: number; trades: number; wins: number }

export function dailyPnl(trades: Trade[]): DailyPoint[] {
  const m = new Map<string, DailyPoint>();
  for (const t of closedOnly(trades)) {
    const d = dayKey(t.closeTime!);
    const p = m.get(d) ?? { date: d, pnl: 0, trades: 0, wins: 0 };
    p.pnl += t.netPnl;
    p.trades++;
    if (t.netPnl > 0) p.wins++;
    m.set(d, p);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function equityCurve(trades: Trade[]) {
  let eq = 0, peak = 0;
  return dailyPnl(trades).map((d) => {
    eq += d.pnl;
    peak = Math.max(peak, eq);
    return { date: d.date, equity: eq, drawdown: eq - peak, pnl: d.pnl };
  });
}

export interface GroupRow { key: string; count: number; netPnl: number; winRate: number; avg: number; profitFactor: number }

export function groupBy(trades: Trade[], keyFn: (t: Trade) => string | string[], order?: string[]): GroupRow[] {
  const m = new Map<string, Trade[]>();
  for (const t of closedOnly(trades)) {
    const keys = ([] as string[]).concat(keyFn(t));
    for (const k of keys) {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
  }
  const rows = [...m.entries()].map(([key, ts]) => {
    const s = computeStats(ts);
    return { key, count: s.count, netPnl: s.netPnl, winRate: s.winRate, avg: s.expectancy, profitFactor: s.profitFactor };
  });
  if (order) return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return rows.sort((a, b) => b.netPnl - a.netPnl);
}

export const WEEKDAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
export const weekday = (iso: string) => WEEKDAYS[(new Date(iso.slice(0, 10) + 'T12:00:00').getDay() + 6) % 7];

export function holdBucket(min: number): string {
  if (min < 1) return '< 1 min';
  if (min < 5) return '1–5 min';
  if (min < 15) return '5–15 min';
  if (min < 60) return '15–60 min';
  if (min < 240) return '1–4 h';
  if (min < 1440) return '4–24 h';
  if (min < 10080) return '1–7 dní';
  return '> 7 dní';
}
export const HOLD_ORDER = ['< 1 min', '1–5 min', '5–15 min', '15–60 min', '1–4 h', '4–24 h', '1–7 dní', '> 7 dní'];

export function priceBucket(p: number): string {
  if (p < 5) return '< $5';
  if (p < 20) return '$5–20';
  if (p < 50) return '$20–50';
  if (p < 100) return '$50–100';
  if (p < 500) return '$100–500';
  return '> $500';
}
export const PRICE_ORDER = ['< $5', '$5–20', '$20–50', '$50–100', '$100–500', '> $500'];
