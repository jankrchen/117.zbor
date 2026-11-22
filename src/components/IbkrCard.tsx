import type { IbkrSync } from '../lib/ibkr';
import { dt } from '../lib/format';

export default function IbkrCard({ ibkr }: { ibkr: IbkrSync }) {
  const { status, settings, setSettings, busy, last, run } = ibkr;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Prepojenie s Interactive Brokers <span className="badge long">LEN ČÍTANIE</span></h3>
        <StatusDot ibkr={ibkr} />
      </div>

      {!status ? (
        <p className="muted">Zisťujem stav…</p>
      ) : !status.available ? (
        <p className="muted">Lokálny server nebeží. Spusti aplikáciu cez <code>npm run dev</code> alebo <code>npm start</code>.</p>
      ) : !status.configured ? (
        <Setup />
      ) : (
        <>
          <div className="row">
            <button className="primary" onClick={run} disabled={busy}>{busy ? 'Synchronizujem…' : 'Synchronizovať teraz'}</button>
            <label className="chk">
              <input type="checkbox" checked={settings.auto} onChange={(e) => setSettings({ ...settings, auto: e.target.checked })} />
              Automaticky každých
            </label>
            <select value={settings.intervalMin} disabled={!settings.auto}
              onChange={(e) => setSettings({ ...settings, intervalMin: +e.target.value })}>
              {[5, 15, 30, 60, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
          </div>
          <p className="muted small">
            Flex queries: {status.queries} · posledná synchronizácia: {dt(status.lastSyncAt)}
          </p>
          {last && <div className={`msg ${last.ok ? 'ok' : 'err'}`}>{last.text}</div>}
          {!last && status.lastError && <div className="msg err">{status.lastError}</div>}
        </>
      )}
      <details className="help">
        <summary>Prečo je to bezpečné?</summary>
        <ul>
          <li>Používa sa <b>Flex Web Service token</b>, ktorý vie <b>iba sťahovať výkazy</b>. Nemôže zadávať príkazy, presúvať peniaze ani sa prihlásiť do účtu.</li>
          <li>Token je uložený len v súbore <code>.env</code> na tvojom počítači (nie je v gite). Do prehliadača sa nikdy nedostane a server ho nikde nevypisuje.</li>
          <li>Server počúva len na <code>127.0.0.1</code>, takže zo siete nie je dostupný, a odmieta požiadavky z iných webov.</li>
          <li>Token sa posiela výhradne cez HTTPS na <code>*.interactivebrokers.com</code>.</li>
          <li>V IBKR môžeš token obmedziť na svoju IP adresu a nastaviť mu krátku platnosť.</li>
        </ul>
      </details>
    </div>
  );
}

export function StatusDot({ ibkr }: { ibkr: IbkrSync }) {
  const s = ibkr.status;
  const [cls, text] = !s?.available
    ? ['off', 'offline']
    : !s.configured
      ? ['off', 'nenastavené']
      : ibkr.busy
        ? ['busy', 'synchronizujem']
        : (ibkr.last ? !ibkr.last.ok : !!s.lastError)
          ? ['err', 'chyba']
          : ['on', 'pripojené'];
  return <span className={`dot ${cls}`}>{text}</span>;
}

function Setup() {
  return (
    <div className="setup">
      <p>Nastavenie (raz, cca 5 minút):</p>
      <ol>
        <li>V IBKR Portal choď na <b>Performance &amp; Reports → Flex Queries</b>.</li>
        <li>
          Vytvor <b>Trade Confirmation Flex Query</b> (dnešné obchody, aktualizuje sa počas dňa) a/alebo <b>Activity Flex Query</b> (história, max. 365 dní).
          V sekcii <i>Trades</i> zvoľ <i>Executions</i> a polia: Account ID, Asset Class, Symbol, Date/Time, Quantity, Price/TradePrice, Commission, Buy/Sell, Multiplier, Trade ID. Formát: <b>XML</b>.
        </li>
        <li>Poznač si <b>Query ID</b> každej query.</li>
        <li>V <b>Flex Web Service Configuration</b> zapni službu a vygeneruj <b>token</b>. Odporúčam obmedziť ho na svoju IP adresu.</li>
        <li>
          Skopíruj <code>.env.example</code> na <code>.env</code> a doplň:
          <pre>IBKR_FLEX_TOKEN=tvoj_token{'\n'}IBKR_FLEX_QUERY_IDS=123456,789012</pre>
        </li>
        <li>Reštartuj server (<code>npm run dev</code>). Synchronizácia sa potom spustí automaticky.</li>
      </ol>
    </div>
  );
}
