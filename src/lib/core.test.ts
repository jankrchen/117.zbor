import { buildTrades } from './trades';
import { parseCsv, parseDate } from './parse';
import { computeStats } from './stats';
import { sampleExecutions } from './sample';
import type { Execution } from '../types';

const ex = (id: string, time: string, side: 'BUY' | 'SELL', quantity: number, price: number, fees = 0, multiplier = 1): Execution => ({
  id, time, symbol: 'X', side, quantity, price, fees, multiplier, assetClass: 'STK', account: 'A',
});

describe('buildTrades', () => {
  it('builds a simple long round trip', () => {
    const [t] = buildTrades([ex('1', '2026-01-02T10:00:00', 'BUY', 100, 10, 1), ex('2', '2026-01-02T10:30:00', 'SELL', 100, 11, 1)]);
    expect(t.direction).toBe('LONG');
    expect(t.grossPnl).toBeCloseTo(100);
    expect(t.netPnl).toBeCloseTo(98);
    expect(t.holdMinutes).toBe(30);
    expect(t.isOpen).toBe(false);
  });

  it('handles scaling in/out and shorts', () => {
    const [t] = buildTrades([
      ex('1', '2026-01-02T10:00:00', 'SELL', 50, 20),
      ex('2', '2026-01-02T10:01:00', 'SELL', 50, 22),
      ex('3', '2026-01-02T10:05:00', 'BUY', 60, 19),
      ex('4', '2026-01-02T10:06:00', 'BUY', 40, 21),
    ]);
    expect(t.direction).toBe('SHORT');
    expect(t.maxQuantity).toBe(100);
    expect(t.avgEntry).toBeCloseTo(21);
    expect(t.grossPnl).toBeCloseTo(50 * 20 + 50 * 22 - 60 * 19 - 40 * 21);
  });

  it('splits a position flip into two trades', () => {
    const trades = buildTrades([
      ex('1', '2026-01-02T10:00:00', 'BUY', 100, 10, 2),
      ex('2', '2026-01-02T10:10:00', 'SELL', 150, 12, 3),
      ex('3', '2026-01-02T10:20:00', 'BUY', 50, 11, 1),
    ]);
    expect(trades).toHaveLength(2);
    const [short, long] = trades; // newest first
    expect(long.direction).toBe('LONG');
    expect(long.grossPnl).toBeCloseTo(200);
    expect(long.fees).toBeCloseTo(4);
    expect(short.direction).toBe('SHORT');
    expect(short.grossPnl).toBeCloseTo(50);
    expect(short.fees).toBeCloseTo(2);
  });

  it('applies option multiplier and keeps open trades', () => {
    const trades = buildTrades([
      ex('1', '2026-01-02T10:00:00', 'BUY', 2, 1.5, 0, 100),
      ex('2', '2026-01-02T11:00:00', 'SELL', 2, 2.0, 0, 100),
      ex('3', '2026-01-03T10:00:00', 'BUY', 1, 3, 0, 100),
    ]);
    expect(trades.find((t) => !t.isOpen)!.grossPnl).toBeCloseTo(100);
    expect(trades.find((t) => t.isOpen)!.netPnl).toBeCloseTo(0);
  });
});

describe('parseCsv', () => {
  it('parses a generic CSV', () => {
    const r = parseCsv('DateTime,Symbol,Side,Quantity,Price,Commission\n2026-03-02 09:35:12,AAPL,BUY,100,182.40,1.00\n2026-03-02 10:02:44,AAPL,SELL,100,"183.10",1.00');
    expect(r.errors).toEqual([]);
    expect(r.executions).toHaveLength(2);
    expect(r.executions[1]).toMatchObject({ side: 'SELL', price: 183.1, fees: 1, time: '2026-03-02T10:02:44' });
  });

  it('parses IBKR flex style with signed qty and negative commission', () => {
    const r = parseCsv('ClientAccountID,AssetClass,Symbol,DateTime,Quantity,TradePrice,IBCommission,Buy/Sell,TradeID,Multiplier\nU123,STK,MSFT,20260302;093500,-10,400,-0.35,SELL,555,1\nU123,FUT,ESH6,20260302;100000,1,5000,-2.25,BUY,556,50');
    expect(r.executions[0]).toMatchObject({ side: 'SELL', quantity: 10, fees: 0.35, account: 'U123', id: 'csv:555' });
    expect(r.executions[1].multiplier).toBe(50);
  });

  it('infers futures multiplier when missing', () => {
    const r = parseCsv('Date,Time,Symbol,Side,Qty,Price\n03/02/2026,9:35 AM,MNQH6,Buy,1,18000');
    expect(r.executions[0]).toMatchObject({ assetClass: 'FUT', multiplier: 2, time: '2026-03-02T09:35:00' });
  });

  it('reports missing columns', () => {
    expect(parseCsv('foo,bar\n1,2').errors.length).toBeGreaterThan(0);
  });

  it('parses dates', () => {
    expect(parseDate('20260105')).toBe('2026-01-05T00:00:00');
    expect(parseDate('2026-01-05, 15:04:05')).toBe('2026-01-05T15:04:05');
  });
});

describe('computeStats', () => {
  it('computes win rate, profit factor and drawdown', () => {
    const trades = buildTrades([
      ex('1', '2026-01-02T10:00:00', 'BUY', 1, 10), ex('2', '2026-01-02T11:00:00', 'SELL', 1, 13), // +3
      ex('3', '2026-01-03T10:00:00', 'BUY', 1, 10), ex('4', '2026-01-03T11:00:00', 'SELL', 1, 8), // -2
      ex('5', '2026-01-04T10:00:00', 'BUY', 1, 10), ex('6', '2026-01-04T11:00:00', 'SELL', 1, 9), // -1
    ]);
    const s = computeStats(trades);
    expect(s.count).toBe(3);
    expect(s.winRate).toBeCloseTo(1 / 3);
    expect(s.profitFactor).toBeCloseTo(1);
    expect(s.maxDrawdown).toBeCloseTo(3);
    expect(s.maxConsecLosses).toBe(2);
  });

  it('sample data produces closed trades', () => {
    const trades = buildTrades(sampleExecutions());
    expect(trades.length).toBeGreaterThan(100);
    expect(trades.every((t) => !t.isOpen)).toBe(true);
  });
});
