import { useMemo, useState } from 'react';
import { useJournal } from './lib/store';
import { useIbkrSync } from './lib/ibkr';
import { StatusDot } from './components/IbkrCard';
import { buildTrades } from './lib/trades';
import type { Trade } from './types';
import Dashboard from './components/Dashboard';
import TradesTable from './components/TradesTable';
import CalendarView from './components/CalendarView';
import Reports from './components/Reports';
import ImportView from './components/ImportView';
import TradeDetail from './components/TradeDetail';
import Filters, { applyFilters, emptyFilters, type FilterState } from './components/Filters';

type Tab = 'dashboard' | 'trades' | 'calendar' | 'reports' | 'import';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Prehľad', icon: '◧' },
  { id: 'trades', label: 'Obchody', icon: '≡' },
  { id: 'calendar', label: 'Kalendár', icon: '▦' },
  { id: 'reports', label: 'Reporty', icon: '▤' },
  { id: 'import', label: 'Import', icon: '⇪' },
];

export default function App() {
  const journal = useJournal();
  const ibkr = useIbkrSync(journal.addExecutions);
  const [tab, setTab] = useState<Tab>(journal.executions.length ? 'dashboard' : 'import');
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [selected, setSelected] = useState<string | null>(null);

  const allTrades = useMemo(() => buildTrades(journal.executions), [journal.executions]);
  const trades = useMemo(() => applyFilters(allTrades, filters, journal.meta), [allTrades, filters, journal.meta]);
  const selectedTrade = allTrades.find((t) => t.id === selected) ?? null;

  const open = (t: Trade) => setSelected(t.id);
  const showFilters = tab !== 'import';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">◆</span> Trade Journal
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="ico">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <button className="ibkr-pill" onClick={() => setTab('import')} title="Prepojenie s IBKR">
          IBKR <StatusDot ibkr={ibkr} />
        </button>
        <div className="sidebar-foot">
          {allTrades.length} obchodov · {journal.executions.length} exekúcií
        </div>
      </aside>
      <main>
        {showFilters && (
          <Filters trades={allTrades} meta={journal.meta} value={filters} onChange={setFilters} />
        )}
        {showFilters && allTrades.length === 0 ? (
          <div className="empty card">
            <h2>Zatiaľ žiadne obchody</h2>
            <p>Naimportuj CSV od brokera alebo si načítaj ukážkové dáta.</p>
            <button className="primary" onClick={() => setTab('import')}>Prejsť na import</button>
          </div>
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard trades={trades} meta={journal.meta} onOpen={open} />}
            {tab === 'trades' && <TradesTable trades={trades} meta={journal.meta} onOpen={open} />}
            {tab === 'calendar' && <CalendarView trades={trades} onOpen={open} />}
            {tab === 'reports' && <Reports trades={trades} meta={journal.meta} />}
            {tab === 'import' && <ImportView journal={journal} ibkr={ibkr} onDone={() => setTab('dashboard')} />}
          </>
        )}
      </main>
      {selectedTrade && (
        <TradeDetail
          trade={selectedTrade}
          meta={journal.meta[selectedTrade.id]}
          allTags={[...new Set(Object.values(journal.meta).flatMap((m) => m.tags))]}
          onChange={(p) => journal.updateMeta(selectedTrade.id, p)}
          onDelete={() => {
            journal.deleteExecutions(selectedTrade.executions.map((e) => e.id.replace(/#[ab]$/, '')));
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
