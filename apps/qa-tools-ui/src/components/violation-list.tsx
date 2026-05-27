/**
 * Violation list component.
 *
 * Renders a grouped list of QA findings from GET /runs/:id/results.
 * Each finding shows severity, title, description, selector, and
 * an action to acknowledge or mark as false positive.
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §5.2 Run Results
 */

'use client';

import { useState } from 'react';
import { SeverityBadge } from '@/components/status-badge';
import { updateFindingStatus } from '@/lib/api';
import type { RunFinding, Severity } from '@/lib/types';

interface ViolationListProps {
  findings: RunFinding[];
  runId: string;
  onUpdate?: () => void;
}

const SEVERITY_ORDER: Severity[] = ['critical', 'serious', 'moderate', 'minor', 'info', 'pass'];

export function ViolationList({ findings, runId, onUpdate }: ViolationListProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = findings.filter((f) => f.status === 'open');
  const acked = findings.filter((f) => f.status !== 'open');

  // Sort by severity
  const sorted = [...open].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  async function handleAction(
    finding: RunFinding,
    status: 'acknowledged' | 'fixed' | 'false-positive',
  ) {
    setUpdating(finding.id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[finding.id];
      return next;
    });
    try {
      await updateFindingStatus(runId, finding.id, status);
      onUpdate?.();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [finding.id]: err instanceof Error ? err.message : 'Update failed',
      }));
    } finally {
      setUpdating(null);
    }
  }

  if (findings.length === 0) {
    return (
      <div className="card py-10 text-center text-sm text-green-600">
        ✅ No violations found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((f) => (
        <FindingCard
          key={f.id}
          finding={f}
          loading={updating === f.id}
          error={errors[f.id]}
          onAction={(status) => handleAction(f, status)}
        />
      ))}

      {acked.length > 0 && (
        <details className="text-sm text-gray-400">
          <summary className="cursor-pointer py-2 hover:text-gray-600">
            {String(acked.length)} acknowledged / resolved finding
            {acked.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2 opacity-60">
            {acked.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                loading={false}
                onAction={() => undefined}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

interface FindingCardProps {
  finding: RunFinding;
  loading: boolean;
  error?: string;
  onAction: (status: 'acknowledged' | 'fixed' | 'false-positive') => void;
}

function FindingCard({ finding: f, loading, error, onAction }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = f.status === 'open';

  return (
    <div className="card p-4 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <SeverityBadge severity={f.severity} />
          {f.violationId && (
            <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
              {f.violationId}
            </code>
          )}
        </div>
        {!isOpen && (
          <span className="badge bg-green-50 text-green-700 capitalize shrink-0">
            {f.status}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-900">{f.title}</p>

      {/* Selector */}
      {f.selector && (
        <code className="block text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded overflow-x-auto">
          {f.selector}
        </code>
      )}

      {/* Collapsible detail */}
      {(f.description ?? f.remediationHint) && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-brand-600 hover:underline"
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      )}
      {expanded && (
        <div className="text-xs text-gray-600 space-y-1.5 border-t border-gray-100 pt-2">
          {f.description && <p>{f.description}</p>}
          {f.remediationHint && (
            <p className="text-brand-700">
              <span className="font-medium">Fix: </span>
              {f.remediationHint}
            </p>
          )}
          {f.affectedNodes > 1 && (
            <p className="text-gray-400">{String(f.affectedNodes)} nodes affected</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {isOpen && (
        <div className="flex items-center gap-2 pt-1">
          <button
            disabled={loading}
            onClick={() => onAction('acknowledged')}
            className="text-xs btn-secondary py-1"
          >
            Acknowledge
          </button>
          <button
            disabled={loading}
            onClick={() => onAction('fixed')}
            className="text-xs btn-secondary py-1"
          >
            Mark fixed
          </button>
          <button
            disabled={loading}
            onClick={() => onAction('false-positive')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            False positive
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
