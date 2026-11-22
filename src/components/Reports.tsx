import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Trade, TradeMeta } from '../types';
import { groupBy, holdBucket, HOLD_ORDER, priceBucket, PRICE_ORDER, weekday, WEEKDAYS, type GroupRow } from '../lib/stats';
import { money, num, pct, pnlClass } from '../lib/format';
import { C, tooltipStyle } from './Dashboard';

interface Props { trades: Trade[]; meta: Record<string, TradeMeta> }

type Dim = { id: string; label: string; fn: (t: Trade) => string | string[]; order?: string[] };

export default function Reports({ trades, meta }: Props) {
  const dims: Dim[] = useMemo(() => [
    { id: 'symbol', label: 'Symbol', fn: (t) => t.symbol },
    { id: 'weekday', label: 'Deň v týždni', fn: (t) => weekday(t.openTime), order: WEEKDAYS },
    { id: 'hour', label: 'Hodina vstupu', fn: (t) => `${t.openTime.slice(11, 13)}:00`, order: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`) },
    { id: 'month', label: 'Mesiac', fn: (t) => t.closeTime!.slice(0, 7), order: [...new Set(trades.map((t) => (t.closeTime ?? '').slice(0, 7)))].sort() },
    { id: 'direction', label: 'Smer', fn: (t) => t.direction },
    { id: 'hold', label: 'Dĺžka držania', fn: (t) => holdBucket(t.holdMinutes), order: HOLD_ORDER },
    { id: 'price', label: 'Cena vstupu', fn: (t) => priceBucket(t.avgEntry), order: PRICE_ORDER },
    { id: 'asset', label: 'Trieda aktív', fn: (t) => t.assetClass },
    { id: 'tag', label: 'Štítok', fn: (t) => (meta[t.id]?.tags.length ? meta[t.id].tags : ['(bez štítku)']) },
    { id: 'account', label: 'Účet', fn: (t) => t.account },
  ], [trades, meta]);

  const [dimId, setDimId] = useState('symbol');
  const [metric, setMetric] = useState<keyof GroupRow>('netPnl');
  const dim = dims.find((d) => d.id === dimId)!;
  const rows = useMemo(() => groupBy(trades, dim.fn, dim.order), [trades, dim]);
  const chartRows = dim.order ? rows : rows.slice(0, 25);

  const fmt = (m: keyof GroupRow, v: number) =>
    m === 'winRate' ? pct(v) : m === 'count' ? String(v) : m === 'profitFactor' ? num(v) : money(v);

  return (
    <div className="stack">
      <div className="seg wrap">
        {dims.map((d) => (
          <button key={d.id} className={d.id === dimId ? 'active' : ''} onClick={() => setDimId(d.id)}>{d.label}</button>
        ))}
      </div>
      <div className="card">
        <div className="card-head">
          <h3>{dim.label}</h3>
          <select value={metric} onChange={(e) => setMetric(e.target.value as keyof GroupRow)}>
            <option value="netPnl">Čistý P&L</option>
            <option value="avg">Priemer na obchod</option>
            <option value="winRate">Úspešnosť</option>
            <option value="count">Počet obchodov</option>
            <option value="profitFactor">Profit factor</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartRows.map((r) => ({ ...r, profitFactor: Number.isFinite(r.profitFactor) ? r.profitFactor : 0 }))}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="key" tick={{ fill: C.muted, fontSize: 11 }} interval={0} angle={chartRows.length > 10 ? -35 : 0} textAnchor={chartRows.length > 10 ? 'end' : 'middle'} height={chartRows.length > 10 ? 60 : 30} />
            <YAxis tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={(v) => fmt(metric, v)} width={70} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => fmt(metric, v)} cursor={{ fill: 'var(--hover)' }} />
            <Bar dataKey={metric} radius={[3, 3, 0, 0]}>
              {chartRows.map((r) => {
                const v = r[metric] as number;
                const good = metric === 'winRate' ? v >= 0.5 : metric === 'profitFactor' ? v >= 1 : metric === 'count' ? true : v >= 0;
                return <Cell key={r.key} fill={metric === 'count' ? C.accent : good ? C.pos : C.neg} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>{dim.label}</th><th className="r">Obchody</th><th className="r">Úspešnosť</th><th className="r">Profit factor</th><th className="r">Priemer</th><th className="r">Čistý P&L</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><b>{r.key}</b></td>
                <td className="r">{r.count}</td>
                <td className="r">{pct(r.winRate)}</td>
                <td className="r">{num(r.profitFactor)}</td>
                <td className={`r ${pnlClass(r.avg)}`}>{money(r.avg)}</td>
                <td className={`r ${pnlClass(r.netPnl)}`}><b>{money(r.netPnl)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
