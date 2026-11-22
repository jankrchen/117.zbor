/**
 * Historical price bars for the trade charts, proxied from Yahoo Finance's public chart endpoint
 * (no API key; browsers can't call it directly because of CORS). Read-only, no credentials involved.
 */
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const INTERVALS = new Set(['1m', '5m', '15m', '1h', '1d']);
const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,32}$/;
const TTL_MS = 10 * 60_000;
const MAX_CACHE = 300;

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }
export interface PriceResult { symbol: string; interval: string; candles: Candle[]; source: 'yahoo' }

const cache = new Map<string, { at: number; data: PriceResult }>();

export class PriceError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

export function validate(q: URLSearchParams) {
  const symbol = q.get('symbol') ?? '';
  const interval = q.get('interval') ?? '';
  const from = Math.floor(Number(q.get('from')));
  const to = Math.floor(Number(q.get('to')));
  if (!SYMBOL_RE.test(symbol)) throw new PriceError('Neplatný symbol.', 400);
  if (!INTERVALS.has(interval)) throw new PriceError('Neplatný interval.', 400);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || from < 0) throw new PriceError('Neplatné obdobie.', 400);
  if (to - from > 3650 * 86400) throw new PriceError('Obdobie je príliš dlhé.', 400);
  return { symbol, interval, from, to };
}

export function parseYahoo(json: any): Candle[] {
  const err = json?.chart?.error;
  if (err) throw new PriceError(`Yahoo: ${err.description ?? err.code ?? 'chyba'}`, err.code === 'Not Found' ? 404 : 502);
  const r = json?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if ([o, h, l, c].some((v) => typeof v !== 'number' || !Number.isFinite(v))) continue;
    out.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? undefined });
  }
  return out;
}

export async function getPrices(q: URLSearchParams): Promise<PriceResult> {
  const { symbol, interval, from, to } = validate(q);
  const key = `${symbol}|${interval}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const url = new URL(YAHOO + encodeURIComponent(symbol));
  url.searchParams.set('period1', String(from));
  url.searchParams.set('period2', String(to));
  url.searchParams.set('interval', interval === '1h' ? '60m' : interval);
  url.searchParams.set('includePrePost', 'true');
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (TradeJournal)', Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const cause = e instanceof Error ? ((e.cause as Error | undefined)?.message ?? e.message) : String(e);
    throw new PriceError(`Nepodarilo sa spojiť so zdrojom cien: ${cause}`);
  }
  const json = await res.json().catch(() => null);
  if (!json) throw new PriceError(`Zdroj cien vrátil HTTP ${res.status}`);
  const data: PriceResult = { symbol, interval, candles: parseYahoo(json), source: 'yahoo' };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data });
  return data;
}
