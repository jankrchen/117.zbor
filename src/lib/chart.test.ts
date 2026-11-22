import { buildTrades } from './trades';
import { chartSymbol, epochToWall, planChart, syntheticCandles, tzOffset, wallSec, wallToEpoch } from './chart';
import type { Execution } from '../types';

const ex = (id: string, time: string, side: 'BUY' | 'SELL', price: number): Execution => ({
  id, time, symbol: 'AAPL', side, quantity: 10, price, fees: 0, multiplier: 1, assetClass: 'STK', account: 'DEMO',
});
const trade = (open: string, close: string) => buildTrades([ex('1', open, 'BUY', 100), ex('2', close, 'SELL', 101)])[0];

describe('timezones', () => {
  it('converts NY wall time to epoch across DST', () => {
    // 2026-07-01 09:30 EDT = 13:30 UTC; 2026-12-01 09:30 EST = 14:30 UTC
    expect(wallToEpoch(wallSec('2026-07-01T09:30:00'), 'America/New_York')).toBe(Date.UTC(2026, 6, 1, 13, 30) / 1000);
    expect(wallToEpoch(wallSec('2026-12-01T09:30:00'), 'America/New_York')).toBe(Date.UTC(2026, 11, 1, 14, 30) / 1000);
    expect(tzOffset(Date.UTC(2026, 0, 1) / 1000, 'Europe/Bratislava')).toBe(3600);
  });
  it('round-trips', () => {
    const w = wallSec('2026-03-08T12:00:00');
    expect(epochToWall(wallToEpoch(w, 'America/Chicago'), 'America/Chicago')).toBe(w);
  });
});

describe('planChart', () => {
  const now = wallSec('2026-11-22T12:00:00');
  it('uses 1m bars for a recent intraday trade', () => {
    const p = planChart(trade('2026-11-20T10:00:00', '2026-11-20T10:30:00'), now);
    expect(p.interval).toBe('1m');
    expect(p.from).toBeLessThan(wallSec('2026-11-20T10:00:00'));
    expect(p.to).toBeGreaterThan(wallSec('2026-11-20T10:30:00'));
  });
  it('falls back to coarser bars for older / longer trades', () => {
    expect(planChart(trade('2026-10-10T10:00:00', '2026-10-10T11:00:00'), now).interval).toBe('5m');
    expect(planChart(trade('2026-03-02T10:00:00', '2026-03-05T11:00:00'), now).interval).toBe('1h');
    expect(planChart(trade('2023-03-02T10:00:00', '2023-03-05T11:00:00'), now).interval).toBe('1d');
  });
  it('ignores a preferred interval the source cannot serve', () => {
    expect(planChart(trade('2026-03-02T10:00:00', '2026-03-02T11:00:00'), now, '1m').interval).toBe('1h');
  });
});

describe('chartSymbol', () => {
  it('maps broker symbols to the data source', () => {
    expect(chartSymbol({ symbol: 'AAPL', assetClass: 'STK' })).toBe('AAPL');
    expect(chartSymbol({ symbol: 'BRK B', assetClass: 'STK' })).toBe('BRK-B');
    expect(chartSymbol({ symbol: 'SPY   260320C00500000', assetClass: 'OPT' })).toBe('SPY260320C00500000');
    expect(chartSymbol({ symbol: 'MESH6', assetClass: 'FUT' })).toBe('MES=F');
    expect(chartSymbol({ symbol: 'EUR.USD', assetClass: 'CASH' })).toBe('EURUSD=X');
  });
});

describe('syntheticCandles', () => {
  it('produces bars whose range contains every fill', () => {
    const t = trade('2026-07-01T10:00:00', '2026-07-01T10:30:00');
    const plan = planChart(t, wallSec('2026-07-02T00:00:00'));
    const cs = syntheticCandles(t, plan);
    expect(cs.length).toBeGreaterThan(100);
    for (const e of t.executions) {
      const s = wallSec(e.time);
      const c = cs.filter((c) => c.time <= s).pop()!;
      expect(c.low).toBeLessThanOrEqual(e.price);
      expect(c.high).toBeGreaterThanOrEqual(e.price);
    }
  });
});
