/**
 * Health grid component.
 *
 * Renders a 4-column grid showing health status for each app × environment
 * combination. Each cell is color-coded and links to the app detail view.
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §5.2 Dashboard
 */

'use client';

import Link from 'next/link';
import type { AppHealth } from '@/lib/types';
import { APP_LABELS, HEALTH_COLORS } from '@/lib/types';

interface HealthGridProps {
  healthData: AppHealth[];
  loading?: boolean;
}

export function HealthGrid({ healthData, loading }: HealthGridProps) {
  const apps = ['selfprime', 'capricast', 'cipherofhealing', 'xicocity'] as const;
  const envs = ['production', 'staging'] as const;

  function getHealth(appId: string, env: string): AppHealth | null {
    return (
      healthData.find((h) => h.appId === appId && h.environment === env) ?? null
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {apps.flatMap((app) =>
          envs.map((env) => (
            <div
              key={`${app}-${env}`}
              className="card animate-pulse h-24 bg-gray-100"
            />
          )),
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Environment headers */}
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {apps.map((app) => (
          <div key={app} className="text-xs font-semibold text-gray-500 truncate">
            {APP_LABELS[app]}
          </div>
        ))}
      </div>

      {envs.map((env) => (
        <div key={env} className="mb-3">
          <div className="mb-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">
            {env}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {apps.map((appId) => {
              const h = getHealth(appId, env);
              const status = h?.statusLabel ?? 'unknown';
              const colors = HEALTH_COLORS[status];
              return (
                <Link
                  key={appId}
                  href={`/apps?appId=${appId}&environment=${env}`}
                  className={`card border ${colors} flex flex-col gap-1 p-3 no-underline
                              hover:ring-2 hover:ring-brand-500 transition-all`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize">{status}</span>
                    <StatusDot status={status} />
                  </div>
                  {h && (
                    <>
                      {h.openViolationsCount > 0 && (
                        <span className="text-xs">
                          {String(h.openViolationsCount)} open
                        </span>
                      )}
                      {h.lastRunAt && (
                        <span className="text-xs text-gray-400">
                          {formatAgo(h.lastRunAt)}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: AppHealth['statusLabel'] }) {
  const dotColors: Record<AppHealth['statusLabel'], string> = {
    healthy:  'bg-green-500',
    degraded: 'bg-yellow-500',
    critical: 'bg-red-500',
    unknown:  'bg-gray-400',
    checking: 'bg-blue-400 animate-pulse',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${dotColors[status]}`} />;
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
