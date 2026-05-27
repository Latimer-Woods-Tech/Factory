/**
 * Run table component.
 *
 * Renders a sorted list of audit runs with app, environment, profile,
 * status, violation count, duration, and creation time.
 *
 * Each row links to the run detail page at /runs?id=<runId>.
 */

'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import type { RunSummary } from '@/lib/types';
import { APP_LABELS } from '@/lib/types';

interface RunTableProps {
  runs: RunSummary[];
  loading?: boolean;
  emptyMessage?: string;
}

export function RunTable({
  runs,
  loading,
  emptyMessage = 'No runs found.',
}: RunTableProps) {
  if (loading) {
    return (
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <TableHead />
          <tbody>
            {Array.from({ length: 5 }, (_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }, (__, j) => (
                  <td key={j} className="table-td">
                    <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="card py-12 text-center text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full">
        <TableHead />
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="group hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <td className="table-td font-medium">
                <Link
                  href={`/runs?id=${run.id}`}
                  className="text-brand-600 hover:underline"
                >
                  {APP_LABELS[run.appId]}
                </Link>
              </td>
              <td className="table-td capitalize text-gray-600">{run.environment}</td>
              <td className="table-td">
                <span className="badge bg-gray-100 text-gray-600">{run.profile}</span>
              </td>
              <td className="table-td capitalize text-gray-500 hidden md:table-cell">
                {run.testType}
              </td>
              <td className="table-td">
                <StatusBadge status={run.status} pulse />
              </td>
              <td className="table-td text-right font-mono text-xs">
                {run.violationsCount > 0 ? (
                  <span className="text-red-600">{String(run.violationsCount)}</span>
                ) : (
                  <span className="text-green-600">0</span>
                )}
              </td>
              <td className="table-td text-right text-gray-400 text-xs hidden lg:table-cell">
                {run.durationMs != null ? `${String(Math.round(run.durationMs / 1000))}s` : '—'}
              </td>
              <td className="table-td text-right text-xs text-gray-400">
                {formatAgo(run.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableHead() {
  return (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="table-th">App</th>
        <th className="table-th">Env</th>
        <th className="table-th">Profile</th>
        <th className="table-th hidden md:table-cell">Type</th>
        <th className="table-th">Status</th>
        <th className="table-th text-right">Violations</th>
        <th className="table-th text-right hidden lg:table-cell">Duration</th>
        <th className="table-th text-right">Age</th>
      </tr>
    </thead>
  );
}

function formatAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${String(diffMin)}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${String(diffH)}h ago`;
  return `${String(Math.floor(diffH / 24))}d ago`;
}
