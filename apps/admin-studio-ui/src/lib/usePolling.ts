/**
 * usePolling — background auto-refresh hook with page-visibility awareness.
 * Keeps existing data visible during background refresh (no flash-to-loading).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api.js';

export interface UsePollingOptions {
  path: string;
  intervalMs?: number;
  enabled?: boolean;
}

export interface UsePollingResult<T> {
  data: T | null;
  error: string | null;
  lastUpdatedAt: number | null;
  isRefreshing: boolean;  // background refresh in flight (data already present)
  isLoading: boolean;     // initial load (no data yet)
  refresh: () => void;    // manual trigger
}

export function usePolling<T>({ path, intervalMs = 30_000, enabled = true }: UsePollingOptions): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cancelledRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (background = false) => {
    if (cancelledRef.current) return;
    if (background) setIsRefreshing(true);
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    try {
      const result = await apiFetch<T>(path, { signal: controllerRef.current.signal });
      if (!cancelledRef.current) {
        setData(result);
        setError(null);
        setLastUpdatedAt(Date.now());
      }
    } catch (e) {
      if (!cancelledRef.current && (e as Error).name !== 'AbortError') {
        setError((e as Error).message);
      }
    } finally {
      if (!cancelledRef.current) setIsRefreshing(false);
    }
  }, [path]);

  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;
    void load(false);
    const interval = setInterval(() => void load(true), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
      controllerRef.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, load]);

  return {
    data,
    error,
    lastUpdatedAt,
    isRefreshing,
    isLoading: data === null && error === null,
    refresh: () => void load(false),
  };
}
