import type { Execution } from '../types';
import { parseDate } from './dates.ts';

/**
 * Parses an IBKR Flex statement (XML) into executions.
 * Supports Activity Flex queries (<Trade .../>) and Trade Confirmation Flex queries (<TradeConfirm .../>).
 * Pure function with no dependencies so it runs both in the browser and in the Node server.
 */
export interface FlexParseResult {
  executions: Execution[];
  skipped: number;
  accounts: string[];
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]] = decode(m[2]);
  return out;
}

const num = (v: string | undefined) => {
  const n = parseFloat((v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function parseFlexXml(xml: string, opts: { includeFx?: boolean } = {}): FlexParseResult {
  const executions: Execution[] = [];
  const accounts = new Set<string>();
  let skipped = 0;
  const re = /<(Trade|TradeConfirm)\s([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const a = attrs(m[2]);
    // Activity Flex can include ORDER / CLOSED_LOT summary rows; only executions are real fills.
    const lvl = (a.levelOfDetail ?? '').toUpperCase();
    if (lvl && lvl !== 'EXECUTION') continue;
    const asset = (a.assetCategory ?? '').toUpperCase();
    if (asset === 'CASH' && !opts.includeFx) continue;

    const qty = num(a.quantity);
    const bs = (a.buySell ?? '').toUpperCase();
    const side = bs.startsWith('BUY') ? 'BUY' : bs.startsWith('SELL') ? 'SELL' : qty > 0 ? 'BUY' : qty < 0 ? 'SELL' : null;
    const time = parseDate(a.dateTime ?? `${a.tradeDate ?? ''} ${a.tradeTime ?? ''}`);
    const price = Math.abs(num(a.tradePrice ?? a.price));
    const symbol = (a.symbol ?? '').trim();
    const tradeId = a.tradeID || a.execID || a.ibExecID || a.transactionID;
    if (!side || !time || !symbol || !qty || !price || !tradeId) {
      skipped++;
      continue;
    }
    const account = a.accountId || 'IBKR';
    accounts.add(account);
    executions.push({
      // Same scheme as CSV import (`id:<TradeID>`) so CSV and API data deduplicate against each other.
      id: `id:${tradeId}`,
      time,
      symbol,
      side,
      quantity: Math.abs(qty),
      price,
      fees: Math.abs(num(a.ibCommission ?? a.commission)) + Math.abs(num(a.taxes)),
      multiplier: num(a.multiplier) || (asset === 'OPT' || asset === 'FOP' ? 100 : 1),
      assetClass: asset || 'STK',
      account,
    });
  }
  return { executions, skipped, accounts: [...accounts] };
}

/** Parses the small <FlexStatementResponse> envelope used by SendRequest / GetStatement. */
export function parseFlexEnvelope(xml: string) {
  const tag = (name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim();
  return {
    isEnvelope: /<FlexStatementResponse/.test(xml),
    status: tag('Status'),
    referenceCode: tag('ReferenceCode'),
    url: tag('Url'),
    errorCode: tag('ErrorCode'),
    errorMessage: tag('ErrorMessage'),
  };
}
