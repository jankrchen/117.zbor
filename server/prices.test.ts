import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseYahoo, validate } from './prices.ts';

const YAHOO_OK = {
  chart: { error: null, result: [{
    timestamp: [1782912600, 1782912660, 1782912720],
    indicators: { quote: [{ open: [100, 101, null], high: [101, 102, null], low: [99, 100, null], close: [101, 101.5, null], volume: [10, 20, null] }] },
  }] },
};

describe('prices', () => {
  it('parses Yahoo bars and drops empty ones', () => {
    expect(parseYahoo(YAHOO_OK)).toEqual([
      { time: 1782912600, open: 100, high: 101, low: 99, close: 101, volume: 10 },
      { time: 1782912660, open: 101, high: 102, low: 100, close: 101.5, volume: 20 },
    ]);
    expect(() => parseYahoo({ chart: { error: { code: 'Not Found', description: 'No data found' } } })).toThrow(/No data/);
  });

  it('validates input', () => {
    const q = (o: Record<string, string>) => new URLSearchParams({ symbol: 'AAPL', interval: '5m', from: '1000', to: '2000', ...o });
    expect(validate(q({}))).toMatchObject({ symbol: 'AAPL' });
    expect(() => validate(q({ symbol: '../etc' }))).toThrow();
    expect(() => validate(q({ symbol: 'A'.repeat(40) }))).toThrow();
    expect(() => validate(q({ interval: '3m' }))).toThrow();
    expect(() => validate(q({ from: '3000' }))).toThrow();
  });
});

function call(handleApi: any, url: string, headers: Record<string, string> = {}) {
  const r = { status: 0, body: '' };
  const res = { writeHead: (s: number) => { r.status = s; }, end: (b: string) => { r.body = b; } } as unknown as ServerResponse;
  const req = { method: 'GET', url, headers: { host: 'localhost:5173', 'x-trade-journal': '1', ...headers } } as unknown as IncomingMessage;
  return handleApi(req, res).then(() => ({ ...r, json: JSON.parse(r.body) }));
}

describe('/api/prices', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('proxies Yahoo through the local guard and caches results', async () => {
    const fetchMock = vi.fn(async (_u: URL) => new Response(JSON.stringify(YAHOO_OK)));
    vi.stubGlobal('fetch', fetchMock);
    const { handleApi } = await import('./api.ts');
    const url = '/api/prices?symbol=AAPL&interval=1m&from=1782912000&to=1782913000';
    const r = await call(handleApi, url);
    expect(r.status).toBe(200);
    expect(r.json.candles).toHaveLength(2);
    const sent = fetchMock.mock.calls[0][0] as URL;
    expect(sent.hostname).toBe('query1.finance.yahoo.com');
    expect(sent.pathname).toBe('/v8/finance/chart/AAPL');
    await call(handleApi, url);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign hosts and invalid symbols without calling out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { handleApi } = await import('./api.ts');
    expect((await call(handleApi, '/api/prices?symbol=AAPL&interval=1m&from=1&to=2', { host: 'evil.com' })).status).toBe(403);
    expect((await call(handleApi, '/api/prices?symbol=AA%2FPL&interval=1m&from=1&to=2')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
