/**
 * Command Center tab — shows blocking gates from factory_gates_blocking (P1.11).
 *
 * Fetches GET /v1/blocking from the admin-studio backend, which proxies the
 * factory_gates_blocking view from THE_FACTORY Neon read-layer. Renders
 * the list within 1 second on a warm worker (acceptance criterion §2.3).
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';

interface BlockingGate {
  id: string;
  gate_type: string;
  source_system: string;
  source_ref: string;
  subject_type: string;
  subject_repo: string | null;
  subject_ref: string;
  state: 'pending' | 'failed' | string;
  evidence_url: string | null;
  observed_at: string;
}

interface BlockingResponse {
  gates: BlockingGate[];
  note?: string;
}

export function CommandCenterTab() {
  const [data, setData] = useState<BlockingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BlockingResponse>('/v1/blocking')
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="p-6 text-destructive">
        <p className="font-medium">Failed to load blocking gates</p>
        <p className="text-sm mt-1 opacity-80">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-muted-foreground">Loading&hellip;</div>;
  }

  const { gates, note } = data;

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Command Center</h2>
        {note && <span className="text-xs text-muted-foreground italic">{note}</span>}
      </div>

      {gates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No blocking gates — everything is clear.
        </p>
      ) : (
        <ul className="space-y-2">
          {gates.map((g) => (
            <li
              key={g.id}
              className="rounded border border-border bg-card p-3 flex items-start gap-3"
            >
              <span
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${
                  g.state === 'failed'
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                }`}
              >
                {g.state}
              </span>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{g.gate_type}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {g.subject_type}/{g.subject_ref}
                  {g.subject_repo ? ` — ${g.subject_repo}` : ''}
                </p>
                {g.evidence_url && (
                  <a
                    href={g.evidence_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Evidence &rarr;
                  </a>
                )}
              </div>

              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(g.observed_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
