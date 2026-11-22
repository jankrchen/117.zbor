import { useMemo, useState } from 'react';
import type { Trade, TradeMeta } from '../types';
import { dt, duration, money, num, pct, pnlClass } from '../lib/format';

interface Props { trades: Trade[]; meta: Record<string, TradeMeta>; onOpen: (t: Trade) => void }

type Col = { key: string; label: string; right?: boolean; get: (t: Trade) => number | string };
const COLS: Col[] = [
  { key: 'open', label: 'Otvorené', get: (t) => t.openTime },
  { key: 'close', label: 'Zatvorené', get: (t) => t.closeTime ?? '' },
  { key: 'symbol', label: 'Symbol', get: (t) => t.symbol },
  { key: 'dir', label: 'Smer', get: (t) => t.direction },
  { key: 'qty', label: 'Množ.', right: true, get: (t) => t.maxQuantity },
  { key: 'entry', label: 'Vstup', right: true, get: (t) => t.avgEntry },
  { key: 'exit', label: 'Výstup', right: true, get: (t) => t.avgExit },
  { key: 'hold', label: 'Držanie', right: true, get: (t) => t.holdMinutes },
  { key: 'fees', label: 'Poplatky', right: true, get: (t) => t.fees },
  { key: 'ret', label: 'Návratnosť', right: true, get: (t) => t.returnPct },
  { key: 'pnl', label: 'Čistý P&L', right: true, get: (t) => t.netPnl },
];

const PAGE = 50;

export default function TradesTable({ trades, meta, onOpen }: Props) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'open', dir: -1 });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)!;
    return [...trades].sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [trades, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const rows = sorted.slice(page * PAGE, page * PAGE + PAGE);

  const exportCsv = () => {
    const head = ['open', 'close', 'symbol', 'direction', 'qty', 'avgEntry', 'avgExit', 'fees', 'netPnl', 'tags', 'notes'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = sorted.map((t) =>
      [t.openTime, t.closeTime, t.symbol, t.direction, t.maxQuantity, t.avgEntry, t.avgExit, t.fees.toFixed(2), t.netPnl.toFixed(2),
        (meta[t.id]?.tags ?? []).join('|'), meta[t.id]?.notes].map(esc).join(','),
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'trades.csv';
    a.click();
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>{trades.length} obchodov</h3>
        <button onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`sortable ${c.right ? 'r' : ''}`}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : -1 }))}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th>Štítky</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => onOpen(t)}>
                <td>{dt(t.openTime)}</td>
                <td>{t.isOpen ? <span className="badge open">OTVORENÝ</span> : dt(t.closeTime)}</td>
                <td><b>{t.symbol}</b> <span className="muted small">{t.assetClass}</span></td>
                <td><span className={`badge ${t.direction.toLowerCase()}`}>{t.direction}</span></td>
                <td className="r">{num(t.maxQuantity)}</td>
                <td className="r">{num(t.avgEntry, 4)}</td>
                <td className="r">{t.avgExit ? num(t.avgExit, 4) : '—'}</td>
                <td className="r">{duration(t.holdMinutes)}</td>
                <td className="r muted">{money(t.fees)}</td>
                <td className={`r ${pnlClass(t.netPnl)}`}>{pct(t.returnPct, 2)}</td>
                <td className={`r ${pnlClass(t.netPnl)}`}><b>{money(t.netPnl)}</b></td>
                <td>{(meta[t.id]?.tags ?? []).map((g) => <span key={g} className="tag">{g}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
          <span>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}
