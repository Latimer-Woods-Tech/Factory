/**
 * Worker health section — pings /health on all known Factory workers
 * and returns a roll-up of their status.
 */

export interface WorkerHealthStatus {
  name: string;
  url: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number | null;
  httpStatus: number | null;
}

export interface HealthRollup {
  statuses: WorkerHealthStatus[];
  healthyCount: number;
  degradedCount: number;
  downCount: number;
}

const WORKERS: Array<{ name: string; url: string }> = [
  // Canonical branded URLs from docs/service-registry.yml (url field)
  { name: 'supervisor', url: 'https://supervisor.latwoodtech.work/health' },
  { name: 'schedule-worker', url: 'https://schedule.latwoodtech.work/health' },
  { name: 'video-cron', url: 'https://video-cron.latwoodtech.work/health' },
  { name: 'synthetic-monitor', url: 'https://monitor.latwoodtech.work/health' },
  { name: 'status-prober', url: 'https://status.latwoodtech.work/health' },
  { name: 'admin-studio', url: 'https://api.apunlimited.com/health' },
  { name: 'capricast-api', url: 'https://api.capricast.com/health' },
  { name: 'cypher-healing', url: 'https://api.cipherofhealing.com/health' },
  { name: 'factory-core-api', url: 'https://core.latwoodtech.work/health' },
  { name: 'webhook-fanout', url: 'https://webhooks.latwoodtech.work/health' },
  // Workers without branded domains — keep workers.dev for internal infra
  { name: 'daily-brief', url: 'https://daily-brief.adrper79.workers.dev/health' },
  { name: 'qa-tools-worker', url: 'https://api.qa.latimerwoods.dev/health' },
  { name: 'lead-gen', url: 'https://lead-gen.adrper79.workers.dev/health' },
];

export async function fetchWorkerHealth(): Promise<HealthRollup> {
  const checks = await Promise.allSettled(
    WORKERS.map(async (worker): Promise<WorkerHealthStatus> => {
      const start = Date.now();
      try {
        const res = await fetch(worker.url, {
          method: 'GET',
          signal: AbortSignal.timeout(5_000),
        });
        const latencyMs = Date.now() - start;
        const status = res.ok ? 'healthy' : res.status >= 500 ? 'down' : 'degraded';
        return { name: worker.name, url: worker.url, status, latencyMs, httpStatus: res.status };
      } catch {
        return {
          name: worker.name,
          url: worker.url,
          status: 'down',
          latencyMs: null,
          httpStatus: null,
        };
      }
    }),
  );

  const statuses = checks.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : ({
          name: WORKERS[i]?.name ?? 'unknown',
          url: WORKERS[i]?.url ?? '',
          status: 'down' as const,
          latencyMs: null,
          httpStatus: null,
        }),
  );

  return {
    statuses,
    healthyCount: statuses.filter((s) => s.status === 'healthy').length,
    degradedCount: statuses.filter((s) => s.status === 'degraded').length,
    downCount: statuses.filter((s) => s.status === 'down').length,
  };
}
