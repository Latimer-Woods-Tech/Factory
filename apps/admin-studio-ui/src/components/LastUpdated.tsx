/**
 * LastUpdated — live "Updated 30s ago" ticker.
 * Re-renders every 10s to keep the label fresh.
 */
import { useEffect, useState } from 'react';

interface Props {
  at: number | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export function LastUpdated({ at, isRefreshing, onRefresh }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!at) return null;

  const seconds = Math.floor((Date.now() - at) / 1000);
  const label =
    seconds < 10 ? 'just now' :
    seconds < 60 ? `${seconds}s ago` :
    `${Math.floor(seconds / 60)}m ago`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 tabular-nums">
        {isRefreshing ? (
          <span className="animate-pulse text-slate-400">refreshing…</span>
        ) : (
          <>Updated {label}</>
        )}
      </span>
      {onRefresh && !isRefreshing && (
        <button
          onClick={onRefresh}
          aria-label="Refresh now"
          className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          ↻
        </button>
      )}
    </div>
  );
}
