import Papa from 'papaparse';
import type { Execution } from '../types';

/**
 * Column aliases (lower-cased, non-alphanumerics stripped) for common broker exports:
 * IBKR Flex / Activity statement, generic CSV, TradingView/other platforms.
 */
const ALIASES: Record<string, string[]> = {
  datetime: ['datetime', 'dateandtime', 'executiontime', 'filltime', 'timestamp', 'tradedatetime', 'datetimeutc'],
  date: ['date', 'tradedate', 'filldate', 'executiondate'],
  time: ['time', 'tradetime', 'executiontimeonly'],
  symbol: ['symbol', 'ticker', 'instrument', 'contract', 'underlyingsymbol', 'localsymbol'],
  side: ['side', 'buysell', 'action', 'type', 'direction'],
  quantity: ['quantity', 'qty', 'shares', 'size', 'filledqty', 'amount'],
  price: ['price', 'tradeprice', 'fillprice', 'avgprice', 'executionprice', 'tprice'],
  fees: ['fees', 'commission', 'ibcommission', 'commfee', 'commissions', 'fee', 'commfees', 'totalfees'],
  multiplier: ['multiplier', 'mult', 'pointvalue', 'contractsize'],
  assetClass: ['assetclass', 'assetcategory', 'securitytype', 'sectype', 'instrumenttype'],
  account: ['account', 'accountid', 'clientaccountid', 'accountnumber'],
  id: ['tradeid', 'executionid', 'execid', 'ibexecid', 'id', 'orderid', 'transactionid'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function mapHeaders(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const normed = headers.map((h) => [h, norm(h)] as const);
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const hit = normed.find(([, n]) => n === alias);
      if (hit && !Object.values(out).includes(hit[0])) {
        out[field] = hit[0];
        break;
      }
    }
  }
  return out;
}

const num = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/[\s$€,]/g, '').replace(/^\((.*)\)$/, '-$1');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

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

function parseSide(raw: string, qty: number): 'BUY' | 'SELL' | null {
  const s = norm(raw);
  if (/^(buy|b|bot|bought|long|buytoopen|buytoclose|bto|btc)$/.test(s) || s.startsWith('buy')) return 'BUY';
  if (/^(sell|s|sld|sold|short|selltoopen|selltoclose|sto|stc|sellshort|ss)$/.test(s) || s.startsWith('sell')) return 'SELL';
  if (qty) return qty > 0 ? 'BUY' : 'SELL';
  return null;
}

export interface ParseResult {
  executions: Execution[];
  skipped: number;
  mapping: Record<string, string>;
  errors: string[];
}

export function parseCsv(text: string, fileTag = 'csv'): ParseResult {
  // IBKR Activity statements contain multiple sections; keep only the "Trades" section.
  if (/^Trades,Header,/m.test(text)) {
    text = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith('Trades,Header,') || l.startsWith('Trades,Data,Order'))
      .map((l) => l.split(',').slice(2).join(','))
      .filter((l, i, arr) => i === 0 || l !== arr[0])
      .join('\n');
  }

  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const headers = res.meta.fields ?? [];
  const map = mapHeaders(headers);
  const errors: string[] = [];
  if (!map.symbol) errors.push('Chýba stĺpec so symbolom (Symbol/Ticker).');
  if (!map.price) errors.push('Chýba stĺpec s cenou (Price/TradePrice).');
  if (!map.quantity) errors.push('Chýba stĺpec s množstvom (Quantity/Qty).');
  if (!map.datetime && !map.date) errors.push('Chýba stĺpec s dátumom (Date/DateTime).');
  if (errors.length) return { executions: [], skipped: res.data.length, mapping: map, errors };

  const executions: Execution[] = [];
  let skipped = 0;
  res.data.forEach((row, i) => {
    const rawQty = num(row[map.quantity]);
    const side = parseSide(map.side ? row[map.side] ?? '' : '', rawQty);
    const time = map.datetime ? parseDate(row[map.datetime]) : parseDate(row[map.date], map.time ? row[map.time] : '');
    const symbol = (row[map.symbol] ?? '').trim();
    const price = num(row[map.price]);
    if (!side || !time || !symbol || !rawQty || !price) {
      skipped++;
      return;
    }
    const assetClass = (map.assetClass ? row[map.assetClass] : '')?.trim() || guessAssetClass(symbol);
    const multiplier = num(map.multiplier ? row[map.multiplier] : '') || defaultMultiplier(assetClass, symbol);
    executions.push({
      id: `${fileTag}:${map.id && row[map.id] ? row[map.id] : `${time}-${symbol}-${i}`}`,
      time,
      symbol,
      side,
      quantity: Math.abs(rawQty),
      price: Math.abs(price),
      fees: Math.abs(num(map.fees ? row[map.fees] : 0)),
      multiplier,
      assetClass,
      account: (map.account ? row[map.account] : '')?.trim() || 'Default',
    });
  });
  return { executions, skipped, mapping: map, errors };
}

function guessAssetClass(symbol: string): string {
  if (/\d{6}[CP]\d+/.test(symbol.replace(/\s/g, ''))) return 'OPT';
  if (/^(ES|NQ|MES|MNQ|YM|MYM|RTY|M2K|CL|MCL|GC|MGC|SI|ZB|ZN|6E)[FGHJKMNQUVXZ]\d{1,2}$/.test(symbol)) return 'FUT';
  return 'STK';
}

/** Point values of common CME futures. */
const FUT_POINT_VALUE: Record<string, number> = {
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  CL: 1000, MCL: 100, GC: 100, MGC: 10, SI: 5000, ZB: 1000, ZN: 1000, '6E': 125000,
};

function defaultMultiplier(assetClass: string, symbol: string): number {
  const a = assetClass.toUpperCase();
  if (a.startsWith('OPT') || a.includes('OPTION')) return 100;
  if (a.startsWith('FUT') || a.includes('FUTURE')) {
    const root = symbol.match(/^([A-Z0-9]{1,3}?)[FGHJKMNQUVXZ]\d{1,2}$/)?.[1];
    return (root && FUT_POINT_VALUE[root]) || 1;
  }
  return 1;
}
