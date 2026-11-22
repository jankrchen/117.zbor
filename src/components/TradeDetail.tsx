import { useEffect, useState } from 'react';
import type { Trade, TradeMeta } from '../types';
import { dt, duration, money, num, pct, pnlClass } from '../lib/format';

interface Props {
  trade: Trade;
  meta?: TradeMeta;
  allTags: string[];
  onChange: (p: Partial<TradeMeta>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function TradeDetail({ trade: t, meta, allTags, onChange, onDelete, onClose }: Props) {
  const tags = meta?.tags ?? [];
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(meta?.notes ?? '');

  useEffect(() => setNotes(meta?.notes ?? ''), [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addTag = (g: string) => {
    const v = g.trim();
    if (v && !tags.includes(v)) onChange({ tags: [...tags, v] });
    setTagInput('');
  };

  const r = meta?.risk ? t.netPnl / meta.risk : null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>
            {t.symbol} <span className={`badge ${t.direction.toLowerCase()}`}>{t.direction}</span>
            {t.isOpen && <span className="badge open">OTVORENÝ</span>}
          </h2>
          <button className="link" onClick={onClose}>✕</button>
        </div>
        <div className={`big ${pnlClass(t.netPnl)}`}>{money(t.netPnl)}</div>

        <dl className="metrics">
          <dt>Otvorené</dt><dd>{dt(t.openTime)}</dd>
          <dt>Zatvorené</dt><dd>{dt(t.closeTime)}</dd>
          <dt>Držanie</dt><dd>{duration(t.holdMinutes)}</dd>
          <dt>Max. pozícia</dt><dd>{num(t.maxQuantity)}{t.multiplier > 1 ? ` × ${t.multiplier}` : ''}</dd>
          <dt>Priem. vstup / výstup</dt><dd>{num(t.avgEntry, 4)} / {t.avgExit ? num(t.avgExit, 4) : '—'}</dd>
          <dt>Hrubý P&L</dt><dd className={pnlClass(t.grossPnl)}>{money(t.grossPnl)}</dd>
          <dt>Poplatky</dt><dd>{money(t.fees)}</dd>
          <dt>Návratnosť</dt><dd className={pnlClass(t.returnPct)}>{pct(t.returnPct, 2)}</dd>
          <dt>Účet</dt><dd>{t.account}</dd>
          <dt>R-násobok</dt><dd className={r == null ? '' : pnlClass(r)}>{r == null ? '—' : `${num(r)} R`}</dd>
        </dl>

        <h4>Exekúcie</h4>
        <table className="tbl small">
          <thead><tr><th>Čas</th><th>Strana</th><th className="r">Množ.</th><th className="r">Cena</th><th className="r">Poplatok</th></tr></thead>
          <tbody>
            {t.executions.map((e) => (
              <tr key={e.id}>
                <td>{dt(e.time)}</td>
                <td className={e.side === 'BUY' ? 'pos' : 'neg'}>{e.side}</td>
                <td className="r">{num(e.quantity)}</td>
                <td className="r">{num(e.price, 4)}</td>
                <td className="r">{money(e.fees)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Riziko a hodnotenie</h4>
        <div className="row">
          <label>Plánované riziko ($)
            <input type="number" min="0" step="any" value={meta?.risk ?? ''} onChange={(e) => onChange({ risk: e.target.value ? +e.target.value : undefined })} />
          </label>
          <label>Hodnotenie
            <div className="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={(meta?.rating ?? 0) >= n ? 'on' : ''} onClick={() => onChange({ rating: meta?.rating === n ? 0 : n })}>★</button>
              ))}
            </div>
          </label>
        </div>

        <h4>Štítky (setup, chyby, emócie…)</h4>
        <div className="tags">
          {tags.map((g) => (
            <span key={g} className="tag">{g} <button onClick={() => onChange({ tags: tags.filter((x) => x !== g) })}>×</button></span>
          ))}
          <input list="tag-list" placeholder="pridať štítok + Enter" value={tagInput}
            onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag(tagInput)} />
          <datalist id="tag-list">{allTags.filter((g) => !tags.includes(g)).map((g) => <option key={g} value={g} />)}</datalist>
        </div>

        <h4>Poznámky</h4>
        <textarea rows={6} value={notes} placeholder="Prečo som vstúpil, čo sa stalo, čo nabudúce inak…"
          onChange={(e) => setNotes(e.target.value)} onBlur={() => onChange({ notes })} />

        <div className="row end">
          <button className="danger" onClick={() => confirm('Zmazať exekúcie tohto obchodu?') && onDelete()}>Zmazať obchod</button>
        </div>
      </div>
    </div>
  );
}
