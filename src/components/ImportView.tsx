import { useRef, useState } from 'react';
import type { Journal } from '../lib/store';
import { parseCsv } from '../lib/parse';
import { sampleExecutions } from '../lib/sample';
import type { Execution, Side } from '../types';
import type { IbkrSync } from '../lib/ibkr';
import IbkrCard from './IbkrCard';

interface Props { journal: Journal; ibkr: IbkrSync; onDone: () => void }

export default function ImportView({ journal, ibkr, onDone }: Props) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const parts: string[] = [];
    let ok = true;
    for (const f of [...files]) {
      const res = parseCsv(await f.text(), f.name);
      if (res.errors.length) {
        ok = false;
        parts.push(`${f.name}: ${res.errors.join(' ')} Nájdené stĺpce: ${Object.values(res.mapping).join(', ') || 'žiadne'}.`);
        continue;
      }
      const added = journal.addExecutions(res.executions);
      parts.push(`${f.name}: pridaných ${added} exekúcií` +
        (res.executions.length - added ? `, ${res.executions.length - added} duplicitných` : '') +
        (res.skipped ? `, ${res.skipped} riadkov preskočených` : '') + '.');
    }
    setMsg({ ok, text: parts.join('\n') });
  };

  const [form, setForm] = useState({ time: '', symbol: '', side: 'BUY' as Side, quantity: '', price: '', fees: '', multiplier: '1' });
  const addManual = (e: React.FormEvent) => {
    e.preventDefault();
    const ex: Execution = {
      id: `manual:${Date.now()}`,
      time: form.time.length === 16 ? `${form.time}:00` : form.time,
      symbol: form.symbol.trim().toUpperCase(),
      side: form.side,
      quantity: Math.abs(+form.quantity),
      price: Math.abs(+form.price),
      fees: Math.abs(+form.fees || 0),
      multiplier: +form.multiplier || 1,
      assetClass: +form.multiplier === 100 ? 'OPT' : 'STK',
      account: 'Manual',
    };
    journal.addExecutions([ex]);
    setMsg({ ok: true, text: `Pridaná exekúcia ${ex.side} ${ex.quantity} ${ex.symbol} @ ${ex.price}.` });
    setForm({ ...form, quantity: '', price: '', fees: '' });
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify({ executions: journal.executions, meta: journal.meta }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const restore = async (files: FileList | null) => {
    if (!files?.[0]) return;
    try {
      const data = JSON.parse(await files[0].text());
      if (!Array.isArray(data.executions)) throw new Error();
      journal.replaceAll({ executions: data.executions, meta: data.meta ?? {} });
      setMsg({ ok: true, text: `Obnovených ${data.executions.length} exekúcií zo zálohy.` });
    } catch {
      setMsg({ ok: false, text: 'Súbor nie je platná záloha.' });
    }
  };

  return (
    <div className="stack narrow">
      <IbkrCard ibkr={ibkr} />
      <div className="card">
        <h3>Import CSV od brokera</h3>
        <div
          className={`drop ${drag ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
        >
          <div className="drop-ico">⇪</div>
          <div>Pretiahni sem CSV súbor(y) alebo klikni</div>
          <div className="muted small">IBKR (Flex Query / Activity Statement), TD/Schwab, Tradovate, NinjaTrader, Webull a všeobecné CSV</div>
          <input ref={fileRef} type="file" accept=".csv,.txt" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
        <details className="help">
          <summary>Aký formát CSV?</summary>
          <p>Stĺpce sa rozpoznajú automaticky podľa názvu. Potrebné: <code>Date</code>/<code>DateTime</code>, <code>Symbol</code>, <code>Side</code> (Buy/Sell, alebo záporné množstvo = predaj), <code>Quantity</code>, <code>Price</code>. Voliteľné: <code>Time</code>, <code>Commission</code>/<code>Fees</code>, <code>Multiplier</code>, <code>AssetClass</code>, <code>Account</code>, <code>TradeID</code> (na odstránenie duplicít).</p>
          <pre>DateTime,Symbol,Side,Quantity,Price,Commission{'\n'}2026-03-02 09:35:12,AAPL,BUY,100,182.40,1.00{'\n'}2026-03-02 10:02:44,AAPL,SELL,100,183.10,1.00</pre>
          <p>Pre IBKR: Flex Query → Trades, zahrň polia Symbol, DateTime, Quantity, TradePrice, IBCommission, Buy/Sell, AssetClass, Multiplier, TradeID, ClientAccountID.</p>
        </details>
        {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {journal.executions.length > 0 && <button className="primary" onClick={onDone}>Zobraziť prehľad →</button>}
      </div>

      <div className="card">
        <h3>Manuálne pridanie exekúcie</h3>
        <form className="form-grid" onSubmit={addManual}>
          <label>Čas<input type="datetime-local" step="1" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          <label>Symbol<input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} /></label>
          <label>Strana
            <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as Side })}>
              <option value="BUY">Buy</option><option value="SELL">Sell</option>
            </select>
          </label>
          <label>Množstvo<input type="number" step="any" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
          <label>Cena<input type="number" step="any" min="0" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label>Poplatky<input type="number" step="any" min="0" value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} /></label>
          <label>Multiplikátor<input type="number" step="any" min="0" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })} /></label>
          <button className="primary" type="submit">Pridať</button>
        </form>
      </div>

      <div className="card">
        <h3>Dáta</h3>
        <p className="muted">Všetko sa ukladá lokálne v tvojom prehliadači (localStorage). Nič sa neposiela na server.</p>
        <div className="row">
          <button onClick={() => { const n = journal.addExecutions(sampleExecutions()); setMsg({ ok: true, text: `Načítaných ${n} ukážkových exekúcií.` }); }}>Načítať ukážkové dáta</button>
          <button onClick={backup} disabled={!journal.executions.length}>Stiahnuť zálohu (JSON)</button>
          <button onClick={() => backupRef.current?.click()}>Obnoviť zo zálohy</button>
          <input ref={backupRef} type="file" accept=".json" hidden onChange={(e) => { restore(e.target.files); e.target.value = ''; }} />
          <button className="danger" disabled={!journal.executions.length}
            onClick={() => confirm('Naozaj zmazať všetky obchody a poznámky?') && journal.clearAll()}>Zmazať všetko</button>
        </div>
      </div>
    </div>
  );
}
