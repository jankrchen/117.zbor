import { useMemo, useState } from 'react';
import type { Trade } from '../types';
import { dailyPnl, WEEKDAYS } from '../lib/stats';
import { money, pnlClass } from '../lib/format';

interface Props { trades: Trade[]; onOpen: (t: Trade) => void }

const MONTHS = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function CalendarView({ trades, onOpen }: Props) {
  const daily = useMemo(() => new Map(dailyPnl(trades).map((d) => [d.date, d])), [trades]);
  const lastDate = [...daily.keys()].sort().pop() ?? new Date().toISOString().slice(0, 10);
  const [ym, setYm] = useState({ y: +lastDate.slice(0, 4), m: +lastDate.slice(5, 7) - 1 });
  const [day, setDay] = useState<string | null>(null);

  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const monthVals = [...daily.values()].filter((d) => d.date.startsWith(iso(ym.y, ym.m, 1).slice(0, 7)));
  const maxAbs = Math.max(1, ...monthVals.map((d) => Math.abs(d.pnl)));
  const monthPnl = monthVals.reduce((s, d) => s + d.pnl, 0);

  const move = (delta: number) => setYm(({ y, m }) => {
    const n = m + delta;
    return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
  });

  const dayTrades = day ? trades.filter((t) => t.closeTime?.startsWith(day)) : [];

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <button onClick={() => move(-1)}>‹</button>
          <h3>{MONTHS[ym.m]} {ym.y} · <span className={pnlClass(monthPnl)}>{money(monthPnl)}</span></h3>
          <button onClick={() => move(1)}>›</button>
        </div>
        <div className="cal">
          {[...WEEKDAYS, 'Týždeň'].map((w) => <div key={w} className="cal-h">{w}</div>)}
          {weeks.map((wk, wi) => {
            const wkVals = wk.filter(Boolean).map((d) => daily.get(iso(ym.y, ym.m, d!))).filter(Boolean);
            const wkPnl = wkVals.reduce((s, d) => s + d!.pnl, 0);
            return [
              ...wk.map((d, i) => {
                if (!d) return <div key={`${wi}-${i}`} className="cal-c blank" />;
                const k = iso(ym.y, ym.m, d);
                const v = daily.get(k);
                const alpha = v ? 0.15 + 0.55 * (Math.abs(v.pnl) / maxAbs) : 0;
                const bg = v ? `color-mix(in srgb, ${v.pnl >= 0 ? 'var(--pos)' : 'var(--neg)'} ${Math.round(alpha * 100)}%, transparent)` : undefined;
                return (
                  <button key={k} className={`cal-c ${day === k ? 'sel' : ''}`} style={{ background: bg }} onClick={() => setDay(v ? k : null)}>
                    <span className="cal-d">{d}</span>
                    {v && <span className="cal-v">{money(v.pnl, 0)}</span>}
                    {v && <span className="cal-n">{v.trades} obch. · {Math.round((v.wins / v.trades) * 100)} %</span>}
                  </button>
                );
              }),
              <div key={`w${wi}`} className="cal-c week">
                <span className="cal-d">T{wi + 1}</span>
                <span className={`cal-v ${pnlClass(wkPnl)}`}>{wkVals.length ? money(wkPnl, 0) : '—'}</span>
                <span className="cal-n">{wkVals.length} dní</span>
              </div>,
            ];
          })}
        </div>
      </div>
      {day && (
        <div className="card">
          <h3>Obchody {day}</h3>
          <table className="tbl">
            <tbody>
              {dayTrades.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => onOpen(t)}>
                  <td>{t.openTime.slice(11, 16)}–{t.closeTime?.slice(11, 16)}</td>
                  <td><b>{t.symbol}</b></td>
                  <td><span className={`badge ${t.direction.toLowerCase()}`}>{t.direction}</span></td>
                  <td className={`r ${pnlClass(t.netPnl)}`}>{money(t.netPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
