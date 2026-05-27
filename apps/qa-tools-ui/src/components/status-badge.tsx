/**
 * Status and severity badge components.
 */

'use client';

import type { RunStatus, Severity } from '@/lib/types';
import { STATUS_COLORS, SEVERITY_COLORS } from '@/lib/types';

interface StatusBadgeProps {
  status: RunStatus;
  pulse?: boolean;
}

/** Renders a run status as a colored pill badge. */
export function StatusBadge({ status, pulse }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status];
  return (
    <span className={`badge ${colors} capitalize`}>
      {pulse && status === 'running' && (
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {status}
    </span>
  );
}

interface SeverityBadgeProps {
  severity: Severity;
}

/** Renders an axe-core severity as a colored pill badge. */
export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const colors = SEVERITY_COLORS[severity];
  return (
    <span className={`badge border ${colors} capitalize`}>
      {severity}
    </span>
  );
}
