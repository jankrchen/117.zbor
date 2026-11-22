/**
 * Local read-only bridge to the IBKR Flex Web Service.
 *
 * Security model:
 *  - The Flex token can only *download reports*. It cannot place orders, move money or log in.
 *  - The token lives only in server-side environment variables (.env, git-ignored). It is never sent
 *    to the browser, never logged, and only ever transmitted over HTTPS to *.interactivebrokers.com.
 *  - The API only answers requests addressed to localhost carrying a custom header, which blocks
 *    other websites (CSRF / DNS rebinding) from triggering a sync through your browser.
 *  - Syncs are rate limited to protect the token from IBKR throttling / lockout.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseFlexEnvelope, parseFlexXml } from '../src/lib/flex.ts';
import { getPrices, PriceError } from './prices.ts';

const SEND_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest';
const MIN_INTERVAL_MS = 60_000;
const UA = 'TradeJournal/1.0';

interface SyncState {
  lastSyncAt: string | null;
  lastError: string | null;
  lastCount: number;
  inFlight: Promise<unknown> | null;
  cache: unknown;
}
const state: SyncState = { lastSyncAt: null, lastError: null, lastCount: 0, inFlight: null, cache: null };

function config() {
  const token = process.env.IBKR_FLEX_TOKEN?.trim() ?? '';
  const queryIds = (process.env.IBKR_FLEX_QUERY_IDS ?? process.env.IBKR_FLEX_QUERY_ID ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return { token, queryIds, includeFx: process.env.IBKR_INCLUDE_FX === '1', configured: !!token && queryIds.length > 0 };
}

const redact = (s: string) => {
  const { token } = config();
  return token ? s.split(token).join('***') : s;
};

function isIbkrUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && (url.hostname === 'interactivebrokers.com' || url.hostname.endsWith('.interactivebrokers.com'));
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ibkrGet(base: string, params: Record<string, string>): Promise<string> {
  if (!isIbkrUrl(base)) throw new Error('IBKR vrátil neočakávanú adresu – token nebol odoslaný.');
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    const cause = e instanceof Error ? ((e.cause as Error | undefined)?.message ?? e.message) : String(e);
    throw new Error(`Nepodarilo sa spojiť s IBKR (${url.hostname}): ${cause}. Skontroluj internetové pripojenie.`);
  }
  if (!res.ok) throw new Error(`IBKR HTTP ${res.status}`);
  return res.text();
}

/** Runs one Flex query: SendRequest -> poll GetStatement until ready. */
async function runQuery(token: string, queryId: string): Promise<string> {
  const env = parseFlexEnvelope(await ibkrGet(SEND_URL, { t: token, q: queryId, v: '3' }));
  if (env.status !== 'Success' || !env.referenceCode || !env.url) {
    throw new Error(`Flex SendRequest (query ${queryId}): ${env.errorMessage ?? env.status ?? 'neznáma chyba'}${env.errorCode ? ` [${env.errorCode}]` : ''}`);
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(attempt === 0 ? 1500 : 3000);
    const body = await ibkrGet(env.url, { t: token, q: env.referenceCode, v: '3' });
    const e = parseFlexEnvelope(body);
    if (!e.isEnvelope) return body; // the statement itself
    // 1019 = statement generation in progress, 1018 = too many requests: retry later
    if (e.errorCode === '1019' || e.errorCode === '1018') continue;
    throw new Error(`Flex GetStatement (query ${queryId}): ${e.errorMessage ?? e.status} [${e.errorCode ?? '?'}]`);
  }
  throw new Error(`Flex query ${queryId}: výkaz nebol pripravený včas, skús neskôr.`);
}

async function sync() {
  const { token, queryIds, includeFx } = config();
  const executions = [];
  let skipped = 0;
  const accounts = new Set<string>();
  for (const q of queryIds) {
    const xml = await runQuery(token, q);
    const r = parseFlexXml(xml, { includeFx });
    executions.push(...r.executions);
    skipped += r.skipped;
    r.accounts.forEach((a) => accounts.add(a));
  }
  return { executions, skipped, accounts: [...accounts], syncedAt: new Date().toISOString() };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function isLocalRequest(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return false;
  // Custom header => cross-origin pages would need a CORS preflight, which we never grant.
  return req.headers['x-trade-journal'] === '1';
}

/** Returns true if the request was handled. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const [path, query = ''] = (req.url ?? '').split('?');
  if (!path.startsWith('/api/')) return false;
  if (!isLocalRequest(req)) {
    send(res, 403, { error: 'forbidden' });
    return true;
  }

  if (path === '/api/prices' && req.method === 'GET') {
    try {
      send(res, 200, await getPrices(new URLSearchParams(query)));
    } catch (e) {
      send(res, e instanceof PriceError ? e.status : 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  const cfg = config();

  if (path === '/api/ibkr/status' && req.method === 'GET') {
    send(res, 200, {
      configured: cfg.configured,
      queries: cfg.queryIds.length,
      lastSyncAt: state.lastSyncAt,
      lastError: state.lastError,
      lastCount: state.lastCount,
    });
    return true;
  }

  if (path === '/api/ibkr/sync' && req.method === 'POST') {
    if (!cfg.configured) {
      send(res, 400, { error: 'IBKR nie je nastavené: doplň IBKR_FLEX_TOKEN a IBKR_FLEX_QUERY_IDS do súboru .env a reštartuj server.' });
      return true;
    }
    // Rate limit: serve the cached result if the last sync is fresh.
    if (state.cache && state.lastSyncAt && Date.now() - Date.parse(state.lastSyncAt) < MIN_INTERVAL_MS) {
      send(res, 200, { ...(state.cache as object), cached: true });
      return true;
    }
    try {
      state.inFlight ??= sync();
      const result = (await state.inFlight) as Awaited<ReturnType<typeof sync>>;
      state.cache = result;
      state.lastSyncAt = result.syncedAt;
      state.lastCount = result.executions.length;
      state.lastError = null;
      send(res, 200, result);
    } catch (e) {
      state.lastError = redact(e instanceof Error ? e.message : String(e));
      send(res, 502, { error: state.lastError });
    } finally {
      state.inFlight = null;
    }
    return true;
  }

  send(res, 404, { error: 'not found' });
  return true;
}
