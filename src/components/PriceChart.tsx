import { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, CrosshairMode, LineStyle, createChart, type UTCTimestamp } from 'lightweight-charts';
import type { Trade } from '../types';
import {
  allowed, chartSymbol, epochToWall, INTERVAL_SEC, planChart, syntheticCandles, wallSec, wallToEpoch,
  type Candle, type Interval,
} from '../lib/chart';
import { num } from '../lib/format';

const TZ_KEY = 'trade-journal:tz';
export const TIMEZONES = ['America/New_York', 'America/Chicago', 'Europe/Bratislava', 'Europe/London', 'UTC'];

export function loadTz(): string {
  try { return localStorage.getItem(TZ_KEY) || 'America/New_York'; } catch { return 'America/New_York'; }
}
function saveTz(tz: string) {
  try { localStorage.setItem(TZ_KEY, tz); } catch { /* ignore */ }
}

interface Props {
  trade: Trade;
  symbolOverride?: string;
  onSymbolOverride: (s: string | undefined) => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; candles: Candle[]; synthetic: boolean }
  | { kind: 'error'; message: string };

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function PriceChart({ trade, symbolOverride, onSymbolOverride }: Props) {
  const [tz, setTz] = useState(loadTz);
  const [prefer, setPrefer] = useState<Interval | undefined>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [symInput, setSymInput] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const symbol = symbolOverride || chartSymbol(trade);
  const isDemo = trade.account === 'DEMO';
  // Demo candles are simulated, so pretend "now" is just after the trade: every interval is available.
  const nowWall = useMemo(
    () => (isDemo ? wallSec(trade.closeTime ?? trade.openTime) + 86400 : epochToWall(Date.now() / 1000, tz)),
    [tz, isDemo, trade],
  );
  const plan = useMemo(() => planChart(trade, nowWall, prefer), [trade, nowWall, prefer]);
  const ageDays = (nowWall - wallSec(trade.openTime)) / 86400;

  useEffect(() => setSymInput(symbolOverride ?? ''), [trade.id, symbolOverride]);

  // Load candles
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    if (isDemo) {
      setState({ kind: 'ok', candles: syntheticCandles(trade, plan), synthetic: true });
      return;
    }
    const q = new URLSearchParams({
      symbol,
      interval: plan.interval,
      from: String(Math.floor(wallToEpoch(plan.from, tz))),
      to: String(Math.ceil(wallToEpoch(plan.to, tz))),
    });
    fetch(`/api/prices?${q}`, { headers: { 'X-Trade-Journal': '1' } })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body.candles as Candle[];
      })
      .then((cs) => {
        if (cancelled) return;
        const candles = cs.map((c) => ({ ...c, time: epochToWall(c.time, tz) }));
        setState(candles.length
          ? { kind: 'ok', candles, synthetic: false }
          : { kind: 'error', message: 'Pre toto obdobie nie sú dostupné žiadne ceny.' });
      })
      .catch((e) => !cancelled && setState({
        kind: 'error',
        message: e instanceof TypeError ? 'Lokálny server nebeží (spusti npm run dev).' : e.message,
      }));
    return () => { cancelled = true; };
  }, [trade, plan, symbol, tz, isDemo]);

  // Render chart
  useEffect(() => {
    if (state.kind !== 'ok' || !box.current) return;
    const el = box.current;
    const [pos, neg, accent, text, grid, muted] = ['--pos', '--neg', '--accent', '--text', '--grid', '--muted'].map(css);
    const chart = createChart(el, {
      height: 320,
      width: el.clientWidth,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: muted, fontSize: 11 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, timeVisible: plan.interval !== '1d', secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: pos, downColor: neg, borderUpColor: pos, borderDownColor: neg, wickUpColor: pos, wickDownColor: neg,
    });
    series.setData(state.candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));

    // Snap each fill to the bar containing it; markers must sit on existing bars.
    const bar = INTERVAL_SEC[plan.interval];
    const times = state.candles.map((c) => c.time);
    const snap = (t: number) => {
      let lo = 0, hi = times.length - 1, best = times[0];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) { best = times[mid]; lo = mid + 1; } else hi = mid - 1;
      }
      return t - best > bar * 3 && times.length ? null : best; // fill falls in a gap with no data
    };
    const markers = trade.executions
      .map((e) => {
        const t = snap(wallSec(e.time));
        if (t == null) return null;
        const buy = e.side === 'BUY';
        return {
          time: t as UTCTimestamp,
          position: buy ? 'belowBar' as const : 'aboveBar' as const,
          color: buy ? pos : neg,
          shape: buy ? 'arrowUp' as const : 'arrowDown' as const,
          text: `${buy ? 'B' : 'S'} ${num(e.quantity)} @ ${num(e.price, 2)}`,
        };
      })
      .filter((m): m is NonNullable<typeof m> => !!m)
      .sort((a, b) => a.time - b.time);
    series.setMarkers(markers);

    series.createPriceLine({ price: trade.avgEntry, color: accent, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'vstup' });
    if (trade.avgExit) {
      series.createPriceLine({ price: trade.avgExit, color: text, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'výstup' });
    }

    // Focus the view on the trade with some context.
    const open = wallSec(trade.openTime);
    const close = trade.closeTime ? wallSec(trade.closeTime) : times[times.length - 1];
    const ctx = Math.max((close - open) * 0.6, bar * 40);
    chart.timeScale().setVisibleRange({
      from: Math.max(times[0], open - ctx) as UTCTimestamp,
      to: Math.min(times[times.length - 1], close + ctx) as UTCTimestamp,
    });

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [state, trade, plan]);

  const missingFills = state.kind === 'ok' && trade.executions.some((e) => wallSec(e.time) < state.candles[0].time);

  return (
    <div className="pchart">
      <div className="pchart-bar">
        <div className="seg small">
          {(['1m', '5m', '15m', '1h', '1d'] as Interval[]).map((i) => (
            <button key={i} className={plan.interval === i ? 'active' : ''} disabled={!allowed(i, ageDays)}
              title={allowed(i, ageDays) ? '' : 'Pre takto starý obchod zdroj tento interval neposkytuje'}
              onClick={() => setPrefer(i)}>{i}</button>
          ))}
        </div>
        <span className="muted small">{symbol}</span>
        <select className="small" value={tz} title="Časové pásmo, v ktorom broker uvádza časy obchodov"
          onChange={(e) => { setTz(e.target.value); saveTz(e.target.value); }}>
          {TIMEZONES.map((z) => <option key={z}>{z}</option>)}
        </select>
      </div>
      {state.kind === 'loading' && <div className="pchart-msg muted">Načítavam ceny…</div>}
      {state.kind === 'error' && (
        <div className="pchart-msg">
          <div className="msg err">{state.message}</div>
          <div className="row">
            <input placeholder={`Symbol pre graf (napr. ${symbol})`} value={symInput} onChange={(e) => setSymInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSymbolOverride(symInput.trim() || undefined)} />
            <button onClick={() => onSymbolOverride(symInput.trim() || undefined)}>Použiť</button>
          </div>
          <p className="muted small">Pri futures sa používa priebežný kontrakt (napr. ES=F), pri neamerických akciách treba príponu burzy (napr. SAP.DE).</p>
        </div>
      )}
      {state.kind === 'ok' && <div ref={box} className="pchart-canvas" />}
      {state.kind === 'ok' && (
        <div className="muted small pchart-foot">
          {state.synthetic
            ? 'Ukážkové dáta: sviečky sú simulované.'
            : `Zdroj: Yahoo Finance · ${plan.interval} · časy v ${tz}`}
          {missingFills && ' · niektoré exekúcie sú mimo dostupných dát'}
          {symbolOverride && <> · <button className="link small" onClick={() => onSymbolOverride(undefined)}>pôvodný symbol</button></>}
        </div>
      )}
    </div>
  );
}
