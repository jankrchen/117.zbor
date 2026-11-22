import type { Trade, TradeMeta } from '../types';

export interface FilterState {
  from: string;
  to: string;
  symbol: string;
  account: string;
  direction: '' | 'LONG' | 'SHORT';
  tag: string;
  result: '' | 'win' | 'loss';
  includeOpen: boolean;
}

export const emptyFilters: FilterState = {
  from: '', to: '', symbol: '', account: '', direction: '', tag: '', result: '', includeOpen: false,
};

export function applyFilters(trades: Trade[], f: FilterState, meta: Record<string, TradeMeta>): Trade[] {
  const sym = f.symbol.trim().toUpperCase();
  return trades.filter((t) => {
    const d = (t.closeTime ?? t.openTime).slice(0, 10);
    if (!f.includeOpen && t.isOpen) return false;
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (sym && !t.symbol.toUpperCase().includes(sym)) return false;
    if (f.account && t.account !== f.account) return false;
    if (f.direction && t.direction !== f.direction) return false;
    if (f.tag && !meta[t.id]?.tags.includes(f.tag)) return false;
    if (f.result === 'win' && !(t.netPnl > 0)) return false;
    if (f.result === 'loss' && !(t.netPnl < 0)) return false;
    return true;
  });
}

interface Props {
  trades: Trade[];
  meta: Record<string, TradeMeta>;
  value: FilterState;
  onChange: (f: FilterState) => void;
}

export default function Filters({ trades, meta, value, onChange }: Props) {
  const accounts = [...new Set(trades.map((t) => t.account))].sort();
  const tags = [...new Set(Object.values(meta).flatMap((m) => m.tags))].sort();
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v });
  const active = JSON.stringify(value) !== JSON.stringify(emptyFilters);

  const preset = (days: number | 'ytd') => {
    const now = new Date();
    const from = days === 'ytd' ? `${now.getFullYear()}-01-01` : new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
    onChange({ ...value, from, to: '' });
  };

  return (
    <div className="filters">
      <input type="date" value={value.from} onChange={(e) => set('from', e.target.value)} title="Od" />
      <span className="muted">–</span>
      <input type="date" value={value.to} onChange={(e) => set('to', e.target.value)} title="Do" />
      <div className="seg">
        <button onClick={() => preset(7)}>7D</button>
        <button onClick={() => preset(30)}>30D</button>
        <button onClick={() => preset(90)}>90D</button>
        <button onClick={() => preset('ytd')}>YTD</button>
      </div>
      <input placeholder="Symbol" value={value.symbol} onChange={(e) => set('symbol', e.target.value)} style={{ width: 90 }} />
      <select value={value.direction} onChange={(e) => set('direction', e.target.value as FilterState['direction'])}>
        <option value="">Long + Short</option>
        <option value="LONG">Long</option>
        <option value="SHORT">Short</option>
      </select>
      <select value={value.result} onChange={(e) => set('result', e.target.value as FilterState['result'])}>
        <option value="">Všetky výsledky</option>
        <option value="win">Ziskové</option>
        <option value="loss">Stratové</option>
      </select>
      {accounts.length > 1 && (
        <select value={value.account} onChange={(e) => set('account', e.target.value)}>
          <option value="">Všetky účty</option>
          {accounts.map((a) => <option key={a}>{a}</option>)}
        </select>
      )}
      {tags.length > 0 && (
        <select value={value.tag} onChange={(e) => set('tag', e.target.value)}>
          <option value="">Všetky štítky</option>
          {tags.map((a) => <option key={a}>{a}</option>)}
        </select>
      )}
      <label className="chk">
        <input type="checkbox" checked={value.includeOpen} onChange={(e) => set('includeOpen', e.target.checked)} /> Otvorené
      </label>
      {active && <button className="link" onClick={() => onChange(emptyFilters)}>Zrušiť filtre</button>}
    </div>
  );
}
