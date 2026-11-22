import type { Execution } from '../types';

/** Deterministic pseudo-random demo data: ~3 months of intraday stock trades. */
export function sampleExecutions(): Execution[] {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const symbols: [string, number][] = [
    ['AAPL', 190], ['TSLA', 240], ['NVDA', 480], ['AMD', 140], ['MSFT', 370], ['META', 350], ['SPY', 470], ['QQQ', 400],
  ];
  const out: Execution[] = [];
  const start = new Date('2026-07-01T12:00:00');
  let n = 0;
  for (let d = 0; d < 110; d++) {
    const day = new Date(start.getTime() + d * 86400000);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const tradesToday = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < tradesToday; k++) {
      const [sym, base] = symbols[Math.floor(rnd() * symbols.length)];
      const long = rnd() > 0.4;
      const qty = Math.ceil((rnd() * 200 + 20) / 10) * 10;
      const entry = +(base * (1 + (rnd() - 0.5) * 0.1)).toFixed(2);
      const edge = (rnd() - 0.45) * 0.012;
      const exit = +(entry * (1 + (long ? edge : -edge))).toFixed(2);
      const h = 9 + Math.floor(rnd() * 6);
      const mi = h === 9 ? 30 + Math.floor(rnd() * 29) : Math.floor(rnd() * 59);
      const t0 = new Date(day);
      t0.setHours(h, mi, Math.floor(rnd() * 59), 0);
      const t1 = new Date(t0.getTime() + (1 + rnd() * 90) * 60000);
      const iso = (t: Date) => {
        const p = (x: number) => String(x).padStart(2, '0');
        return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
      };
      const base_ = { symbol: sym, multiplier: 1, assetClass: 'STK', account: 'DEMO' };
      const scaleIn = rnd() > 0.7;
      if (scaleIn) {
        const tm = new Date(t0.getTime() + 3 * 60000);
        out.push({ ...base_, id: `demo:${n++}`, time: iso(t0), side: long ? 'BUY' : 'SELL', quantity: qty / 2, price: entry, fees: 0.5 });
        out.push({ ...base_, id: `demo:${n++}`, time: iso(tm), side: long ? 'BUY' : 'SELL', quantity: qty / 2, price: entry, fees: 0.5 });
      } else {
        out.push({ ...base_, id: `demo:${n++}`, time: iso(t0), side: long ? 'BUY' : 'SELL', quantity: qty, price: entry, fees: 1 });
      }
      out.push({ ...base_, id: `demo:${n++}`, time: iso(t1), side: long ? 'SELL' : 'BUY', quantity: qty, price: exit, fees: 1 });
    }
  }
  return out;
}
