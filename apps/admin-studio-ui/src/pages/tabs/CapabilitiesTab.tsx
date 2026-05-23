import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';

interface CapabilityParameterDefinition {
  id: string;
  type: 'string' | 'boolean' | 'integer' | 'number';
  description: string;
  required: boolean;
  enum: Array<string | number | boolean>;
  default: string | number | boolean | null;
  formatHint: string | null;
}

interface CapabilityRecipeSummary {
  id: string;
  summary: string;
  maturity: string;
  primitives: string[];
  optionalPrimitives: string[];
}

interface CapabilityPlan {
  recipe: {
    id: string;
    summary: string;
    goal: string;
    maturity: string;
  };
  env: {
    secrets: string[];
    vars: string[];
    policyTags: string[];
  };
  bindings: {
    required: string[];
    optional: string[];
  };
  expectedSurfaces: string[];
  smokeChecks: Array<{
    path: string;
    expectedStatus: number;
    expectContains?: string;
  }>;
  scaffold: {
    entryScript: string;
    stagingFirst: boolean;
    requiredSecrets: string[];
    requiredBindings: string[];
    requiredVars: string[];
  };
}

interface CapabilityConcept {
  id: string;
  displayName: string;
  summary: string;
  status: string;
  maturity: string;
  tags: string[];
  menuVisible: boolean;
  approvalTier: string;
  parameters: CapabilityParameterDefinition[];
  recipes: CapabilityRecipeSummary[];
  sourcePrimitives: string[];
  qualification: {
    requiredCapabilities?: string[];
    disallowedEnvironments?: string[];
  };
}

interface CapabilityCatalogResponse {
  generatedAt: string;
  summary: {
    primitiveCount: number;
    recipeCount: number;
    conceptCount: number;
    ruleFileCount: number;
  };
  concepts: CapabilityConcept[];
}

interface CapabilityResolutionResponse {
  concept: {
    id: string;
    displayName: string;
    approvalTier: string;
  };
  recipe: {
    id: string;
    summary: string;
    maturity: string;
    goal: string;
    primitives: string[];
    optionalPrimitives: string[];
    expectedSurfaces: string[];
    smokeChecks: Array<{
      path: string;
      expectedStatus: number;
      expectContains?: string;
    }>;
  };
  parameters: Record<string, string | number | boolean | null>;
  nextStep: {
    action: 'compile-recipe-plan';
    recipeId: string;
  };
  resolution: {
    strategy: 'first-approved-recipe-candidate' | 'parameter-rules';
    matchedRuleId: string | null;
  };
}

interface CapabilityPreviewResponse {
  resolution: CapabilityResolutionResponse;
  plan: CapabilityPlan;
  preview: string;
  generatedAt: string;
  nextStep: {
    action: string;
    conceptId: string;
    recipeId: string;
  };
}

interface CapabilityScaffoldHandoff {
  conceptId: string;
  recipeId: string;
  parameters: Record<string, string | number | boolean | null>;
  plan: CapabilityPlan;
  preview: string;
  nextAction: {
    action: string;
    conceptId: string;
    recipeId: string;
  };
}

export function initializeCapabilityFormValues(
  concept: Pick<CapabilityConcept, 'parameters'> | null,
): Record<string, string | number | boolean> {
  if (!concept) {
    return {};
  }

  const nextValues: Record<string, string | number | boolean> = {};
  for (const parameter of concept.parameters) {
    if (parameter.default !== null) {
      nextValues[parameter.id] = parameter.default;
      continue;
    }
    if (parameter.enum.length > 0) {
      const first = parameter.enum[0];
      if (first !== undefined) {
        nextValues[parameter.id] = first;
      }
      continue;
    }
    if (parameter.type === 'boolean') {
      nextValues[parameter.id] = false;
      continue;
    }
    nextValues[parameter.id] = '';
  }

  return nextValues;
}

export function CapabilitiesTab() {
  const [catalog, setCatalog] = useState<CapabilityCatalogResponse | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string | number | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState<CapabilityResolutionResponse | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CapabilityPreviewResponse | null>(null);
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const [handoffInProgress, setHandoffInProgress] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffPackage, setHandoffPackage] = useState<CapabilityScaffoldHandoff | null>(null);
  const [showHandoffPackage, setShowHandoffPackage] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CapabilityCatalogResponse>('/capabilities');
      setCatalog(data);
      setSelectedConceptId((current) => current ?? data.concepts[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const selectedConcept = useMemo(
    () => catalog?.concepts.find((concept) => concept.id === selectedConceptId) ?? null,
    [catalog, selectedConceptId],
  );

  useEffect(() => {
    if (!selectedConcept) {
      setFormValues({});
      return;
    }

    setFormValues(initializeCapabilityFormValues(selectedConcept));
    setResolution(null);
    setResolutionError(null);
    setPreview(null);
    setPreviewError(null);
    setHandoffPackage(null);
    setHandoffError(null);
    setHandoffConfirmed(false);
    setShowHandoffPackage(false);
  }, [selectedConcept]);

  useEffect(() => {
    if (!selectedConcept) {
      return;
    }

    if (resolution || preview || handoffPackage) {
      setResolution(null);
      setResolutionError(null);
      setPreview(null);
      setPreviewError(null);
      setHandoffPackage(null);
      setHandoffError(null);
      setHandoffConfirmed(false);
      setShowHandoffPackage(false);
    }
  }, [formValues, selectedConcept]);

  const workflowStage = useMemo(
    () =>
      deriveCapabilityWorkflowStage({
        selectedConceptId,
        resolution,
        preview,
        handoffConfirmed,
      }),
    [handoffConfirmed, preview, resolution, selectedConceptId],
  );

  async function resolveConcept() {
    if (!selectedConcept) return;
    setResolving(true);
    setResolution(null);
    setResolutionError(null);
    setPreview(null);
    setPreviewError(null);
    setHandoffConfirmed(false);
    setShowHandoffPackage(false);
    try {
      const result = await apiFetch<CapabilityResolutionResponse>('/capabilities/resolve', {
        method: 'POST',
        body: JSON.stringify({ conceptId: selectedConcept.id, params: formValues }),
      });
      setResolution(result);
    } catch (err) {
      setResolutionError(extractErrorMessage(err));
    } finally {
      setResolving(false);
    }
  }

  async function previewConcept() {
    if (!selectedConcept) return;
    setPreviewing(true);
    setPreview(null);
    setPreviewError(null);
    setHandoffPackage(null);
    setHandoffError(null);
    setHandoffConfirmed(false);
    setShowHandoffPackage(false);
    try {
      const result = await apiFetch<CapabilityPreviewResponse>('/capabilities/preview', {
        method: 'POST',
        body: JSON.stringify({ conceptId: selectedConcept.id, params: formValues }),
      });
      setResolution(result.resolution);
      setPreview(result);
    } catch (err) {
      setPreviewError(extractErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function generateHandoff() {
    if (!selectedConcept || !preview) return;
    setHandoffInProgress(true);
    setHandoffPackage(null);
    setHandoffError(null);
    setShowHandoffPackage(false);

    try {
      const response = await apiFetch<{
        generatedAt: string;
        handoff: CapabilityScaffoldHandoff;
      }>('/capabilities/handoff', {
        method: 'POST',
        body: JSON.stringify({ conceptId: selectedConcept.id, params: formValues }),
      });
      setHandoffPackage(response.handoff);
      setShowHandoffPackage(true);
    } catch (err) {
      setHandoffError(extractErrorMessage(err));
    } finally {
      setHandoffInProgress(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Capabilities</h1>
          <p className="text-sm text-slate-400">
            Governed concept menu backed by the capability catalog. Resolve a concept to see the approved
            recipe handoff before compile and scaffold.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadCatalog()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </header>

      {error && (
        <div className="rounded border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {catalog && (
        <div className="flex flex-wrap gap-3 text-sm text-slate-400">
          <span>{catalog.summary.conceptCount} concepts</span>
          <span>{catalog.summary.recipeCount} recipes</span>
          <span>{catalog.summary.primitiveCount} primitives</span>
          <span>Generated {new Date(catalog.generatedAt).toLocaleString()}</span>
        </div>
      )}

      <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Workflow Stage</h2>
            <p className="mt-1 text-sm text-slate-400">
              The Studio stays preview-first: configure, resolve, preview, then confirm a scaffold handoff.
            </p>
          </div>
          <span className="rounded bg-blue-950/50 px-2 py-1 text-xs uppercase tracking-wide text-blue-200">
            {workflowStage.replaceAll('-', ' ')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="rounded border border-slate-800 bg-slate-900 p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Concepts</h2>
          <div className="space-y-2">
            {catalog?.concepts.map((concept) => {
              const isActive = concept.id === selectedConceptId;
              return (
                <button
                  key={concept.id}
                  type="button"
                  onClick={() => setSelectedConceptId(concept.id)}
                  className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-blue-500/60 bg-blue-950/30 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{concept.displayName}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                      {concept.maturity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{concept.summary}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-4 rounded border border-slate-800 bg-slate-900 p-4">
          {!selectedConcept && <p className="text-sm text-slate-500">No governed concepts available.</p>}

          {selectedConcept && (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-white">{selectedConcept.displayName}</h2>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {selectedConcept.approvalTier}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{selectedConcept.summary}</p>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  {selectedConcept.tags.map((tag) => (
                    <span key={tag} className="rounded bg-slate-800 px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                      Parameters
                    </h3>
                    <div className="space-y-3">
                      {selectedConcept.parameters.map((parameter) => (
                        <ParameterField
                          key={parameter.id}
                          parameter={parameter}
                          value={formValues[parameter.id]}
                          onChange={(nextValue) =>
                            setFormValues((current) => ({ ...current, [parameter.id]: nextValue }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={() => void resolveConcept()} disabled={resolving}>
                      {resolving ? 'Resolving…' : 'Resolve Concept'}
                    </Button>
                    <Button variant="secondary" onClick={() => void previewConcept()} disabled={previewing}>
                      {previewing ? 'Previewing…' : 'Preview Plan'}
                    </Button>
                    {resolutionError && <span className="text-sm text-red-300">{resolutionError}</span>}
                    {previewError && <span className="text-sm text-red-300">{previewError}</span>}
                  </div>
                </div>

                <div className="space-y-4">
                  <InfoCard title="Source Primitives" values={selectedConcept.sourcePrimitives} />
                  <InfoCard
                    title="Required Capabilities"
                    values={selectedConcept.qualification.requiredCapabilities ?? []}
                  />
                  <InfoCard
                    title="Disallowed Environments"
                    values={selectedConcept.qualification.disallowedEnvironments ?? []}
                  />
                </div>
              </div>

              {resolution && (
                <div className="rounded border border-emerald-800/60 bg-emerald-950/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                        Resolution Result
                      </h3>
                      <p className="mt-1 text-sm text-slate-200">
                        Selected recipe <span className="font-mono">{resolution.recipe.id}</span> for next step{' '}
                        <span className="font-mono">{resolution.nextStep.action}</span>.
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        Strategy: <span className="font-mono">{resolution.resolution.strategy}</span>
                        {' · '}
                        Rule:{' '}
                        <span className="font-mono">
                          {resolution.resolution.matchedRuleId ?? 'default-fallback'}
                        </span>
                      </p>
                    </div>
                    <span className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">
                      {resolution.recipe.maturity}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Normalized Parameters
                      </h4>
                      <dl className="space-y-2 text-sm text-slate-300">
                        {Object.entries(resolution.parameters).map(([key, value]) => (
                          <div key={key} className="flex items-start justify-between gap-3 rounded bg-slate-950/70 px-3 py-2">
                            <dt className="font-mono text-slate-400">{key}</dt>
                            <dd className="text-right text-slate-200">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Expected Surfaces
                      </h4>
                      <ul className="space-y-2 text-sm text-slate-300">
                        {resolution.recipe.expectedSurfaces.map((surface) => (
                          <li key={surface} className="rounded bg-slate-950/70 px-3 py-2 font-mono">
                            {surface}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {preview && (
                <div className="rounded border border-blue-800/60 bg-blue-950/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">
                        Plan Preview
                      </h3>
                      <p className="mt-1 text-sm text-slate-300">
                        Recipe <span className="font-mono">{preview.plan.recipe.id}</span> prepared for{' '}
                        <span className="font-mono">{preview.nextStep.action}</span>.
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(preview.generatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <InfoCard title="Expected Surfaces" values={preview.plan.expectedSurfaces} />
                    <InfoCard
                      title="Required Secrets"
                      values={preview.plan.env.secrets}
                    />
                    <InfoCard title="Required Vars" values={preview.plan.env.vars} />
                    <InfoCard
                      title="Required Bindings"
                      values={preview.plan.bindings.required}
                    />
                  </div>
                  <div className="mt-4 rounded border border-slate-800 bg-slate-950/70 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Smoke Expectations
                    </h4>
                    {preview.plan.smokeChecks.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No smoke checks declared.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm text-slate-300">
                        {preview.plan.smokeChecks.map((check) => (
                          <li key={`${check.path}-${check.expectedStatus}`} className="rounded bg-slate-900 px-3 py-2">
                            <span className="font-mono">{check.path}</span>
                            {' · expected '}
                            {check.expectedStatus}
                            {check.expectContains ? ` · contains ${check.expectContains}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="mt-4 rounded border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-100">
                    <p>
                      Staging-first handoff is required before provision work. Review the plan, environment contract,
                      and smoke expectations before generating the scaffold package.
                    </p>
                    <p className="mt-2 text-xs text-amber-200/80">
                      Entry script: <span className="font-mono">{preview.plan.scaffold.entryScript}</span>
                      {' · stagingFirst: '}
                      <span className="font-mono">{String(preview.plan.scaffold.stagingFirst)}</span>
                    </p>
                  </div>
                  <pre className="mt-4 overflow-x-auto rounded bg-slate-950/80 p-4 text-xs text-slate-200 whitespace-pre-wrap">
                    {preview.preview}
                  </pre>
                </div>
              )}

              <div className="rounded border border-slate-800 bg-slate-950/70 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Action Rail</h3>
                <div className="mt-3 space-y-3 text-sm text-slate-400">
                  <p>Resolve and preview are reversible. Scaffold handoff stays disabled until the plan has been reviewed.</p>
                  <label className="flex items-start gap-2 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={handoffConfirmed}
                      disabled={!preview}
                      onChange={(event) => setHandoffConfirmed(event.target.checked)}
                    />
                    <span>
                      I reviewed the preview, selected recipe, environment contract, and staging-first requirements.
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="secondary"
                      disabled={!preview || !handoffConfirmed || handoffInProgress}
                      onClick={() => void generateHandoff()}
                    >
                      {handoffInProgress
                        ? 'Generating…'
                        : handoffPackage
                        ? 'Regenerate Scaffold Handoff'
                        : 'Generate Scaffold Handoff'}
                    </Button>
                    <span className="text-xs text-slate-500">
                      {preview && handoffConfirmed
                        ? 'Confirmed handoff is ready for audit and scaffold consumption.'
                        : 'Preview and confirm to enable the handoff package.'}
                    </span>
                  </div>
                  {handoffError && (
                    <div className="rounded border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                      {handoffError}
                    </div>
                  )}
                </div>
              </div>

              {showHandoffPackage && handoffPackage && (
                <div className="rounded border border-violet-800/60 bg-violet-950/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-200">
                        Scaffold Handoff Package
                      </h3>
                      <p className="mt-1 text-sm text-slate-300">
                        Deterministic handoff artifact for the next scaffold step.
                      </p>
                    </div>
                    <span className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">
                      {handoffPackage.recipeId}
                    </span>
                  </div>
                  <pre className="mt-4 overflow-x-auto rounded bg-slate-950/80 p-4 text-xs text-slate-200 whitespace-pre-wrap">
                    {JSON.stringify(handoffPackage, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ParameterField({
  parameter,
  value,
  onChange,
}: {
  parameter: CapabilityParameterDefinition;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center gap-2 text-sm text-slate-200">
        <span>{parameter.id}</span>
        {parameter.required && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
            required
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{parameter.description}</p>
      {parameter.enum.length > 0 ? (
        <select
          value={String(value ?? '')}
          onChange={(event) => onChange(castFormValue(parameter.type, event.target.value))}
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          {parameter.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      ) : parameter.type === 'boolean' ? (
        <label className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>Enabled</span>
        </label>
      ) : (
        <input
          type={parameter.type === 'string' ? 'text' : 'number'}
          value={String(value ?? '')}
          onChange={(event) => onChange(castFormValue(parameter.type, event.target.value))}
          placeholder={parameter.formatHint ?? undefined}
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600"
        />
      )}
    </label>
  );
}

function InfoCard({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {values.length === 0 ? (
        <p className="text-sm text-slate-600">None declared.</p>
      ) : (
        <ul className="space-y-2 text-sm text-slate-300">
          {values.map((value) => (
            <li key={value} className="rounded bg-slate-900 px-2 py-1 font-mono text-xs">
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function castFormValue(type: CapabilityParameterDefinition['type'], value: string): string | number | boolean {
  if (type === 'integer') {
    return Number.parseInt(value, 10);
  }
  if (type === 'number') {
    return Number.parseFloat(value);
  }
  return value;
}

export function deriveCapabilityWorkflowStage({
  selectedConceptId,
  resolution,
  preview,
  handoffConfirmed,
}: {
  selectedConceptId: string | null;
  resolution: CapabilityResolutionResponse | null;
  preview: CapabilityPreviewResponse | null;
  handoffConfirmed: boolean;
}): 'browse' | 'configure' | 'resolved' | 'previewed' | 'confirmed-for-handoff' {
  if (!selectedConceptId) {
    return 'browse';
  }
  if (preview && handoffConfirmed) {
    return 'confirmed-for-handoff';
  }
  if (preview) {
    return 'previewed';
  }
  if (resolution) {
    return 'resolved';
  }
  return 'configure';
}

export function buildCapabilityScaffoldHandoff(
  preview: CapabilityPreviewResponse | null,
): CapabilityScaffoldHandoff | null {
  if (!preview) {
    return null;
  }

  return {
    conceptId: preview.resolution.concept.id,
    recipeId: preview.resolution.recipe.id,
    parameters: preview.resolution.parameters,
    plan: preview.plan,
    preview: preview.preview,
    nextAction: preview.nextStep,
  };
}

export function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'body' in error) {
    const body = (error as { body?: unknown }).body;
    if (body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
  }
  return error instanceof Error ? error.message : 'Unknown error';
}
