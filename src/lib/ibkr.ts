import { useCallback, useEffect, useRef, useState } from 'react';
import type { Execution } from '../types';

export interface IbkrStatus {
  available: boolean; // local server reachable
  configured: boolean;
  queries: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

const HEADERS = { 'X-Trade-Journal': '1' };
const SETTINGS_KEY = 'trade-journal:ibkr-settings';

export interface IbkrSettings { auto: boolean; intervalMin: number }
const DEFAULTS: IbkrSettings = { auto: true, intervalMin: 30 };

function loadSettings(): IbkrSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export async function fetchStatus(): Promise<IbkrStatus> {
  try {
    const r = await fetch('/api/ibkr/status', { headers: HEADERS });
    if (!r.ok) throw new Error();
    return { available: true, ...(await r.json()) };
  } catch {
    return { available: false, configured: false, queries: 0, lastSyncAt: null, lastError: null };
  }
}

export async function syncNow(): Promise<{ executions: Execution[]; skipped: number; accounts: string[]; syncedAt: string }> {
  const r = await fetch('/api/ibkr/sync', { method: 'POST', headers: HEADERS });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
}

/** Keeps the journal in sync with IBKR: on start-up and every `intervalMin` minutes. */
export function useIbkrSync(addExecutions: (e: Execution[]) => number) {
  const [status, setStatus] = useState<IbkrStatus | null>(null);
  const [settings, setSettingsState] = useState<IbkrSettings>(loadSettings);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ ok: boolean; text: string; at: string } | null>(null);
  const addRef = useRef(addExecutions);
  addRef.current = addExecutions;

  const setSettings = (s: IbkrSettings) => {
    setSettingsState(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  };

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const r = await syncNow();
      const added = addRef.current(r.executions);
      setLast({
        ok: true,
        at: r.syncedAt,
        text: `IBKR: ${r.executions.length} exekúcií (${r.accounts.join(', ') || '—'}), nových ${added}.`,
      });
    } catch (e) {
      setLast({ ok: false, at: new Date().toISOString(), text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setStatus(await fetchStatus());
    }
  }, []);

  useEffect(() => {
    fetchStatus().then(setStatus);
  }, []);

  useEffect(() => {
    if (!status?.configured || !settings.auto) return;
    run();
    const id = setInterval(run, Math.max(5, settings.intervalMin) * 60_000);
    return () => clearInterval(id);
  }, [status?.configured, settings.auto, settings.intervalMin, run]);

  return { status, settings, setSettings, busy, last, run };
}

export type IbkrSync = ReturnType<typeof useIbkrSync>;
