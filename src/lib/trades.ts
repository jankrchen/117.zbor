import type { Execution, Trade } from '../types';

const EPS = 1e-9;

/**
 * Group executions into round-trip trades per (account, symbol).
 * A trade starts when the position leaves zero and ends when it returns to zero.
 * A fill that flips the position (e.g. long 100 -> short 50) is split: the part
 * that closes ends the current trade, the remainder opens a new one.
 */
export function buildTrades(executions: Execution[]): Trade[] {
  const sorted = [...executions].sort(
    (a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
  );
  const groups = new Map<string, Execution[]>();
  for (const e of sorted) {
    const key = `${e.account}|${e.symbol}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const trades: Trade[] = [];
  for (const execs of groups.values()) {
    let cur: Execution[] = [];
    let pos = 0;
    for (const e of execs) {
      const signed = e.side === 'BUY' ? e.quantity : -e.quantity;
      const next = pos + signed;
      if (Math.abs(pos) > EPS && Math.sign(next) !== Math.sign(pos) && Math.abs(next) > EPS) {
        // Position flip: split the fill.
        const closeQty = Math.abs(pos);
        const ratio = closeQty / e.quantity;
        cur.push({ ...e, id: `${e.id}#a`, quantity: closeQty, fees: e.fees * ratio });
        trades.push(finalize(cur));
        cur = [{ ...e, id: `${e.id}#b`, quantity: e.quantity - closeQty, fees: e.fees * (1 - ratio) }];
        pos = next;
        continue;
      }
      cur.push(e);
      pos = next;
      if (Math.abs(pos) < EPS) {
        trades.push(finalize(cur));
        cur = [];
        pos = 0;
      }
    }
    if (cur.length) trades.push(finalize(cur));
  }
  return trades.sort((a, b) => b.openTime.localeCompare(a.openTime));
}

function finalize(execs: Execution[]): Trade {
  const first = execs[0];
  const direction = first.side === 'BUY' ? 'LONG' : 'SHORT';
  const entrySide = first.side;
  const mult = first.multiplier || 1;

  let pos = 0;
  let maxQ = 0;
  let entryQty = 0, entryCost = 0, exitQty = 0, exitCost = 0, fees = 0, cash = 0;
  for (const e of execs) {
    pos += e.side === 'BUY' ? e.quantity : -e.quantity;
    maxQ = Math.max(maxQ, Math.abs(pos));
    fees += e.fees;
    cash += (e.side === 'SELL' ? 1 : -1) * e.quantity * e.price * mult;
    if (e.side === entrySide) {
      entryQty += e.quantity;
      entryCost += e.quantity * e.price;
    } else {
      exitQty += e.quantity;
      exitCost += e.quantity * e.price;
    }
  }
  const isOpen = Math.abs(pos) > EPS;
  const avgEntry = entryQty ? entryCost / entryQty : 0;
  const avgExit = exitQty ? exitCost / exitQty : 0;
  // For open trades only count realized part of the P&L.
  const closedQty = Math.min(entryQty, exitQty);
  const grossPnl = isOpen
    ? (direction === 'LONG' ? 1 : -1) * (avgExit - avgEntry) * closedQty * mult
    : cash;
  const netPnl = grossPnl - fees;
  const notional = avgEntry * entryQty * mult;
  const last = execs[execs.length - 1];
  const closeTime = isOpen ? null : last.time;
  const holdMinutes = closeTime
    ? (new Date(closeTime).getTime() - new Date(first.time).getTime()) / 60000
    : 0;

  return {
    id: `${first.account}|${first.symbol}|${first.id}`,
    symbol: first.symbol,
    assetClass: first.assetClass,
    account: first.account,
    multiplier: mult,
    direction,
    openTime: first.time,
    closeTime,
    maxQuantity: maxQ,
    avgEntry,
    avgExit,
    grossPnl,
    fees,
    netPnl,
    returnPct: notional ? netPnl / notional : 0,
    holdMinutes,
    isOpen,
    executions: execs,
  };
}
