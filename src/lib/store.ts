import { useCallback, useEffect, useState } from 'react';
import type { Execution, TradeMeta } from '../types';

const KEY = 'trade-journal:v1';

interface Persisted {
  executions: Execution[];
  meta: Record<string, TradeMeta>;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { executions: [], meta: {} };
}

export function useJournal() {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full / blocked */
    }
  }, [state]);

  /** Adds executions, skipping duplicates by id. Returns number actually added. */
  const addExecutions = useCallback(
    (execs: Execution[]) => {
      const ids = new Set(state.executions.map((e) => e.id));
      const fresh = execs.filter((e) => !ids.has(e.id));
      setState((s) => {
        const cur = new Set(s.executions.map((e) => e.id));
        return { ...s, executions: [...s.executions, ...fresh.filter((e) => !cur.has(e.id))] };
      });
      return fresh.length;
    },
    [state.executions],
  );

  const updateMeta = useCallback((id: string, patch: Partial<TradeMeta>) => {
    setState((s) => ({
      ...s,
      meta: { ...s.meta, [id]: { ...{ tags: [] as string[], notes: '' }, ...s.meta[id], ...patch } },
    }));
  }, []);

  const deleteExecutions = useCallback((ids: string[]) => {
    const del = new Set(ids);
    setState((s) => ({ ...s, executions: s.executions.filter((e) => !del.has(e.id)) }));
  }, []);

  const clearAll = useCallback(() => setState({ executions: [], meta: {} }), []);

  const replaceAll = useCallback((p: Persisted) => setState(p), []);

  return { ...state, addExecutions, updateMeta, deleteExecutions, clearAll, replaceAll };
}

export type Journal = ReturnType<typeof useJournal>;
