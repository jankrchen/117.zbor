import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseFlexXml } from '../src/lib/flex.ts';

const FLEX = `<FlexQueryResponse queryName="t" type="AF"><FlexStatements count="1">
<FlexStatement accountId="U1234567" fromDate="20260301" toDate="20260302">
<Trades>
<Trade accountId="U1234567" assetCategory="STK" symbol="AAPL" dateTime="20260302;093500" quantity="100" tradePrice="182.4" ibCommission="-1" buySell="BUY" multiplier="1" tradeID="111" levelOfDetail="EXECUTION" />
<Trade accountId="U1234567" assetCategory="STK" symbol="AAPL" dateTime="20260302;100244" quantity="-100" tradePrice="183.1" ibCommission="-1.02" buySell="SELL" multiplier="1" tradeID="112" levelOfDetail="EXECUTION" />
<Trade accountId="U1234567" assetCategory="STK" symbol="AAPL" dateTime="20260302;100244" quantity="-100" tradePrice="183.1" buySell="SELL" tradeID="" levelOfDetail="ORDER" />
<Trade accountId="U1234567" assetCategory="STK" symbol="AAPL" dateTime="20260302;100244" quantity="-100" tradePrice="183.1" buySell="SELL" tradeID="9" levelOfDetail="CLOSED_LOT" />
<Trade accountId="U1234567" assetCategory="CASH" symbol="EUR.USD" dateTime="20260302;100244" quantity="10" tradePrice="1.08" buySell="BUY" tradeID="113" levelOfDetail="EXECUTION" />
<Trade accountId="U1234567" assetCategory="OPT" symbol="SPY   260320C00500000" dateTime="2026-03-02;10:30:00" quantity="2" tradePrice="3.5" ibCommission="-1.3" buySell="BUY" multiplier="100" tradeID="114" levelOfDetail="EXECUTION" />
</Trades></FlexStatement></FlexStatements></FlexQueryResponse>`;

describe('parseFlexXml', () => {
  it('keeps only executions, skips FX and summary rows', () => {
    const r = parseFlexXml(FLEX);
    expect(r.executions.map((e) => e.id)).toEqual(['id:111', 'id:112', 'id:114']);
    expect(r.executions[1]).toMatchObject({ side: 'SELL', quantity: 100, price: 183.1, fees: 1.02, time: '2026-03-02T10:02:44', account: 'U1234567' });
    expect(r.executions[2]).toMatchObject({ assetClass: 'OPT', multiplier: 100, time: '2026-03-02T10:30:00' });
    expect(r.accounts).toEqual(['U1234567']);
  });

  it('can include FX and parses TradeConfirm rows', () => {
    expect(parseFlexXml(FLEX, { includeFx: true }).executions).toHaveLength(4);
    const tc = parseFlexXml('<TradeConfirm accountId="U1" assetCategory="FUT" symbol="MESH6" dateTime="20260302;093500" quantity="1" price="5000.25" commission="-0.62" buySell="BUY" multiplier="5" tradeID="77" />');
    expect(tc.executions[0]).toMatchObject({ id: 'id:77', price: 5000.25, fees: 0.62, multiplier: 5 });
  });
});

// ---- server API ----

function mockReq(method: string, url: string, headers: Record<string, string> = {}) {
  return { method, url, headers: { host: 'localhost:5173', 'x-trade-journal': '1', ...headers } } as unknown as IncomingMessage;
}
function mockRes() {
  const r = { status: 0, body: '' as string } as { status: number; body: string; json: () => any };
  const res = {
    writeHead: (s: number) => { r.status = s; },
    end: (b: string) => { r.body = b; },
  } as unknown as ServerResponse;
  r.json = () => JSON.parse(r.body);
  return { res, r };
}

describe('IBKR API', () => {
  const TOKEN = 'secret-token-123';
  let calls: string[];

  beforeEach(() => {
    vi.resetModules();
    process.env.IBKR_FLEX_TOKEN = TOKEN;
    process.env.IBKR_FLEX_QUERY_IDS = '999';
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      calls.push(url.toString());
      const u = new URL(url);
      if (u.pathname.endsWith('SendRequest')) {
        return new Response('<FlexStatementResponse><Status>Success</Status><ReferenceCode>REF1</ReferenceCode><Url>https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement</Url></FlexStatementResponse>');
      }
      return new Response(FLEX);
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.IBKR_FLEX_TOKEN;
    delete process.env.IBKR_FLEX_QUERY_IDS;
  });

  it('syncs executions and never returns the token', async () => {
    const { handleApi } = await import('./api.ts');
    const { res, r } = mockRes();
    const p = handleApi(mockReq('POST', '/api/ibkr/sync'), res);
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(r.status).toBe(200);
    expect(r.json().executions).toHaveLength(3);
    expect(r.body).not.toContain(TOKEN);
    expect(calls.every((c) => new URL(c).hostname.endsWith('.interactivebrokers.com'))).toBe(true);

    const s = mockRes();
    await handleApi(mockReq('GET', '/api/ibkr/status'), s.res);
    expect(s.r.json()).toMatchObject({ configured: true, lastCount: 3 });
    expect(s.r.body).not.toContain(TOKEN);
  });

  it('rejects requests without the custom header or from non-local hosts', async () => {
    const { handleApi } = await import('./api.ts');
    const a = mockRes();
    await handleApi(mockReq('POST', '/api/ibkr/sync', { 'x-trade-journal': '' }), a.res);
    expect(a.r.status).toBe(403);
    const b = mockRes();
    await handleApi(mockReq('POST', '/api/ibkr/sync', { host: 'evil.example.com' }), b.res);
    expect(b.r.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('refuses to send the token to a non-IBKR host returned by SendRequest', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      calls.push(url.toString());
      return new Response('<FlexStatementResponse><Status>Success</Status><ReferenceCode>R</ReferenceCode><Url>https://attacker.example.com/x</Url></FlexStatementResponse>');
    }));
    const { handleApi } = await import('./api.ts');
    const { res, r } = mockRes();
    const p = handleApi(mockReq('POST', '/api/ibkr/sync'), res);
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(r.status).toBe(502);
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.includes('attacker'))).toBe(false);
  });

  it('redacts the token from IBKR error messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(`<FlexStatementResponse><Status>Fail</Status><ErrorCode>1012</ErrorCode><ErrorMessage>Token ${TOKEN} has expired.</ErrorMessage></FlexStatementResponse>`)));
    const { handleApi } = await import('./api.ts');
    const { res, r } = mockRes();
    await handleApi(mockReq('POST', '/api/ibkr/sync'), res);
    expect(r.status).toBe(502);
    expect(r.body).not.toContain(TOKEN);
    expect(r.json().error).toContain('expired');
  });
});
