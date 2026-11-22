import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Trade, TradeMeta } from '../types';
import { computeStats, dailyPnl, equityCurve } from '../lib/stats';
import { duration, money, num, pct, pnlClass, dt } from '../lib/format';

interface Props { trades: Trade[]; meta: Record<string, TradeMeta>; onOpen: (t: Trade) => void }

export const C = { pos: 'var(--pos)', neg: 'var(--neg)', accent: 'var(--accent)', grid: 'var(--grid)', muted: 'var(--muted)' };
export const tooltipStyle = {
  contentStyle: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' },
  labelStyle: { color: 'var(--muted)' },
};

export default function Dashboard({ trades, meta, onOpen }: Props) {
  const s = useMemo(() => computeStats(trades, meta), [trades, meta]);
  const curve = useMemo(() => equityCurve(trades), [trades]);
  const daily = useMemo(() => dailyPnl(trades).slice(-60), [trades]);
  const recent = trades.filter((t) => !t.isOpen).slice(0, 8);

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Čistý P&L" value={money(s.netPnl)} cls={pnlClass(s.netPnl)} sub={`poplatky ${money(s.fees)}`} />
        <Kpi label="Úspešnosť" value={pct(s.winRate)} sub={`${s.wins} W · ${s.losses} L · ${s.scratches} BE`}>
          <Gauge value={s.winRate} />
        </Kpi>
        <Kpi label="Profit factor" value={num(s.profitFactor)} cls={s.profitFactor >= 1 ? 'pos' : 'neg'} sub="hrubý zisk / hrubá strata" />
        <Kpi label="Očakávaná hodnota" value={money(s.expectancy)} cls={pnlClass(s.expectancy)} sub="priemer na obchod" />
        <Kpi label="Priem. zisk / strata" value={`${money(s.avgWin, 0)} / ${money(-s.avgLoss, 0)}`} sub={`payoff ${num(s.payoffRatio)}`} />
        <Kpi label="Max. drawdown" value={money(-s.maxDrawdown)} cls="neg" sub={`${s.greenDays}/${s.tradingDays} ziskových dní`} />
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Kumulatívny P&L</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={(v) => money(v, 0)} width={70} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => money(v)} />
              <Area type="monotone" dataKey="equity" name="Equity" stroke={C.accent} strokeWidth={2} fill="url(#eq)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>Denný P&L (posledných 60 dní)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={(v) => money(v, 0)} width={70} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => money(v)} cursor={{ fill: 'var(--hover)' }} />
              <Bar dataKey="pnl" name="P&L" radius={[3, 3, 0, 0]}>
                {daily.map((d) => <Cell key={d.date} fill={d.pnl >= 0 ? C.pos : C.neg} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Drawdown</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={(v) => money(v, 0)} width={70} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => money(v)} />
              <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke={C.neg} fill={C.neg} fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>Ďalšie metriky</h3>
          <dl className="metrics">
            <dt>Počet obchodov</dt><dd>{s.count}</dd>
            <dt>Najväčší zisk</dt><dd className="pos">{money(s.largestWin)}</dd>
            <dt>Najväčšia strata</dt><dd className="neg">{money(s.largestLoss)}</dd>
            <dt>Séria výhier / prehier</dt><dd>{s.maxConsecWins} / {s.maxConsecLosses}</dd>
            <dt>Priem. držanie (zisk)</dt><dd>{duration(s.avgHoldWin)}</dd>
            <dt>Priem. držanie (strata)</dt><dd>{duration(s.avgHoldLoss)}</dd>
            <dt>Hrubý P&L</dt><dd className={pnlClass(s.grossPnl)}>{money(s.grossPnl)}</dd>
            <dt>Priemerné R</dt><dd>{s.avgR == null ? '— (zadaj riziko v detaile)' : `${num(s.avgR)} R`}</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <h3>Posledné obchody</h3>
        <table className="tbl">
          <thead><tr><th>Zatvorené</th><th>Symbol</th><th>Smer</th><th className="r">Množ.</th><th className="r">Vstup</th><th className="r">Výstup</th><th className="r">Čistý P&L</th></tr></thead>
          <tbody>
            {recent.map((t) => (
              <tr key={t.id} onClick={() => onOpen(t)} className="clickable">
                <td>{dt(t.closeTime)}</td>
                <td><b>{t.symbol}</b></td>
                <td><span className={`badge ${t.direction.toLowerCase()}`}>{t.direction}</span></td>
                <td className="r">{num(t.maxQuantity)}</td>
                <td className="r">{num(t.avgEntry, 4)}</td>
                <td className="r">{num(t.avgExit, 4)}</td>
                <td className={`r ${pnlClass(t.netPnl)}`}>{money(t.netPnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, cls = '', children }: { label: string; value: string; sub?: string; cls?: string; children?: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-row">
        <div className={`kpi-value ${cls}`}>{value}</div>
        {children}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const r = 16, c = Math.PI * r;
  return (
    <svg width="44" height="26" viewBox="0 0 44 26" aria-hidden>
      <path d="M6 22 A16 16 0 0 1 38 22" fill="none" stroke="var(--neg)" strokeWidth="5" strokeLinecap="round" />
      <path d="M6 22 A16 16 0 0 1 38 22" fill="none" stroke="var(--pos)" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`} />
    </svg>
  );
}
