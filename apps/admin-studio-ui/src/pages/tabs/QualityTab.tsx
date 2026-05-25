import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';

// ── Response shapes ──────────────────────────────────────────────────────────
interface DissentResp  { rate: number; window?: string; }
interface TtmTier      { tier: 'Green' | 'Yellow' | 'Red'; value: string; }
interface TtmResp      { tiers: TtmTier[]; }
interface EscapeResp   { rate: number; window?: string; }
interface ActionResp   { ratio: number; total?: number; }
interface DeployResp   { rate: number; window?: string; }
interface LlmCostResp  { usd: number; period?: string; }

// ── Per-tile fetch hook ──────────────────────────────────────────────────────
type TileStatus<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'unavailable' };  // 404 / non-ok → graceful degradation

function useTile<T>(path: string): TileStatus<T> {
  const [tile, setTile] = useState<TileStatus<T>>({ status: 'loading' });
  useEffect(() => {
    apiFetch<T>(path)
      .then((data) => setTile({ status: 'ok', data }))
      .catch(() => setTile({ status: 'unavailable' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return tile;
}

// ── Shared card wrapper ──────────────────────────────────────────────────────
function KpiCard({
  label,
  subtitle,
  children,
}: {
  label: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-4 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      <span className="text-xs text-slate-500 mt-1">{subtitle}</span>
    </div>
  );
}

function LoadingValue() {
  return <span className="text-xl font-semibold text-slate-600 animate-pulse">…</span>;
}

function UnavailableValue() {
  return (
    <div>
      <span className="text-xl font-semibold text-slate-600">—</span>
      <p className="text-[10px] text-slate-600 mt-0.5">endpoint not yet wired</p>
    </div>
  );
}

// ── KPI tiles ────────────────────────────────────────────────────────────────

function DissentTile() {
  const tile = useTile<DissentResp>('/quality/judge-dissent');
  return (
    <KpiCard label="LLM Judge Dissent Rate" subtitle="7d rolling">
      {tile.status === 'loading' && <LoadingValue />}
      {tile.status === 'unavailable' && <UnavailableValue />}
      {tile.status === 'ok' && (
        <span className="text-2xl font-semibold text-white">
          {(tile.data.rate * 100).toFixed(1)}%
        </span>
      )}
    </KpiCard>
  );
}

const TIER_COLORS: Record<string, string> = {
  Green: 'text-green-400',
  Yellow: 'text-amber-400',
  Red: 'text-red-400',
};

function TtmTile() {
  const tile = useTile<TtmResp>('/quality/ttm');
  return (
    <KpiCard label="Mean Time-to-Merge" subtitle="By tier (Green / Yellow / Red)">
      {tile.status === 'loading' && <LoadingValue />}
      {tile.status === 'unavailable' && <UnavailableValue />}
      {tile.status === 'ok' && (
        <table className="w-full mt-1 text-sm">
          <tbody className="divide-y divide-slate-800">
            {tile.data.tiers.map((t) => (
              <tr key={t.tier}>
                <td className={`py-0.5 text-xs font-medium ${TIER_COLORS[t.tier] ?? 'text-slate-400'}`}>
                  {t.tier}
                </td>
                <td className="py-0.5 text-right font-mono text-xs text-white">{t.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </KpiCard>
  );
}

function EscapeTile() {
  const tile = useTile<EscapeResp>('/quality/escape-defects');
  return (
    <KpiCard label="Escape Defect Rate" subtitle="Bugs reaching prod ≤7d after merge">
      {tile.status === 'loading' && <LoadingValue />}
      {tile.status === 'unavailable' && <UnavailableValue />}
      {tile.status === 'ok' && (
        <span className="text-2xl font-semibold text-white">
          {(tile.data.rate * 100).toFixed(2)}%
        </span>
      )}
    </KpiCard>
  );
}

function ActionRequiredTile() {
  const tile = useTile<ActionResp>('/quality/action-required');
  return (
    <KpiCard label="action_required Ratio" subtitle="Of total reviews">
      {tile.status === 'loading' && <LoadingValue />}
      {tile.status === 'unavailable' && <UnavailableValue />}
      {tile.status === 'ok' && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-white">
            {(tile.data.ratio * 100).toFixed(1)}%
          </span>
          {tile.data.total != null && (
            <span className="text-xs text-slate-500">of {tile.data.total.toLocaleString()}</span>
          )}
        </div>
      )}
    </KpiCard>
  );
}

function DeploySuccessTile() {
  const tile = useTile<DeployResp>('/quality/deploy-success');
  const subtitle =
    tile.status === 'ok' && tile.data.window ? tile.data.window : 'Rolling';
  return (
    <KpiCard label="Deploy Success Rate" subtitle={subtitle}>
      {tile.status === 'loading' && <LoadingValue />}
      {tile.status === 'unavailable' && <UnavailableValue />}
      {tile.status === 'ok' && (
        <span className="text-2xl font-semibold text-white">
          {(tile.data.rate * 100).toFixed(1)}%
        </span>
      )}
    </KpiCard>
  );
}

const COST_WARN = 160;   // amber threshold (80% of $200)
const COST_ALERT = 200;  // red threshold

function LlmCostTile() {
  const tile = useTile<LlmCostResp>('/quality/llm-cost');

  let badge: React.ReactNode = null;
  if (tile.status === 'ok') {
    const { usd } = tile.data;
    if (usd >= COST_ALERT) {
      badge = (
        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-900/60 text-red-300">
          ≥ $200
        </span>
      );
    } else if (usd >= COST_WARN) {
      badge = (
        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-900/60 text-amber-300">
          Approaching $200
        </span>
      );
    }
  }

  return (
    <KpiCard label="LLM Judge Cost" subtitle="Rolling month · Alert at $200">
      {tile.status === 'loading' && <LoadingValue />}
      {tile.status === 'unavailable' && <UnavailableValue />}
      {tile.status === 'ok' && (
        <div className="flex items-baseline flex-wrap gap-x-2">
          <span className="text-2xl font-semibold text-white">
            ${tile.data.usd.toFixed(2)}
          </span>
          {badge}
        </div>
      )}
    </KpiCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function QualityTab() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Quality Budget</h1>
        <p className="mt-1 text-sm text-slate-400">
          Platform quality KPIs (issue #536). Each tile polls its own endpoint independently
          — tiles with undeployed endpoints show "—" rather than a page error.
        </p>
      </div>

      {/* Responsive grid: 1 col mobile, 2 col tablet, 3 col desktop */}
      <div className="@container [container-type:inline-size] [container-name:quality-grid]">
        <ul className="grid grid-cols-1 gap-4 @[30rem]:grid-cols-2 @[48rem]:grid-cols-3 list-none p-0">
          <li><DissentTile /></li>
          <li><TtmTile /></li>
          <li><EscapeTile /></li>
          <li><ActionRequiredTile /></li>
          <li><DeploySuccessTile /></li>
          <li><LlmCostTile /></li>
        </ul>
      </div>
    </div>
  );
}
