/**
 * Capability Design Studio — operator surface.
 *
 * Stage A+B+C: Governed concept menu, resolve→preview→handoff→provision state machine.
 * Stage D: Tag-based concept filtering, guided composition templates, recipe version
 *          badges, and deployment evidence panel with live provision status polling.
 *
 * State machine (deriveCapabilityWorkflowStage):
 *   browse → configure → resolved → previewed → confirmed-for-handoff
 *           → staging-provision-requested
 *
 * Backend contract: /capabilities/{,resolve,preview,handoff,provision-staging,
 *                   handoffs/:id,provision-requests/:id}.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  version?: string | null;
  tradeoffs?: string;
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
  templates?: ConceptTemplate[];
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
  schemaVersion?: '1.0.0';
  kind?: 'scaffold-handoff';
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
  id?: string | null;
  hash?: string;
  createdAt?: string;
}

interface ProofGateState {
  reviewedPlan: boolean;
  reviewedEnvContract: boolean;
  reviewedSmokeChecks: boolean;
  acknowledgedStagingFirst: boolean;
  acknowledgedCustomDomain: boolean;
}

interface ProvisionResponse {
  request: {
    id: string;
    handoffId: string;
    status: string;
    requestedAt: string;
  };
  handoff: {
    id: string;
    hash: string;
    conceptId: string;
    recipeId: string;
  };
  nextStep: {
    action: string;
    handoffId: string;
    requestId: string;
  };
}

interface ProvisionRequestRecord {
  id: string;
  handoffId: string;
  status: 'requested' | 'acknowledged' | 'dispatched' | 'succeeded' | 'failed' | 'withdrawn';
  proofGates: ProofGateState;
  requestedBy: string;
  requestedAt: string;
  env: string;
  notes: string | null;
}

type WorkflowStage =
  | 'browse'
  | 'configure'
  | 'resolved'
  | 'previewed'
  | 'confirmed-for-handoff'
  | 'staging-provision-requested';

/** Guided template: pre-fills parameters for a common scenario. */
interface ConceptTemplate {
  id: string;
  label: string;
  hint: string;
  values: Record<string, string | number | boolean>;
}


const PROOF_GATE_LABELS: Array<{ key: keyof ProofGateState; label: string; hint: string }> = [
  {
    key: 'reviewedPlan',
    label: 'I reviewed the compiled plan',
    hint: 'Selected recipe, packages, and expected surfaces match the intended outcome.',
  },
  {
    key: 'reviewedEnvContract',
    label: 'I reviewed the environment contract',
    hint: 'All required secrets, vars, and bindings are accounted for in the target environment.',
  },
  {
    key: 'reviewedSmokeChecks',
    label: 'I reviewed the smoke expectations',
    hint: 'Each smoke check is operationally meaningful for this service.',
  },
  {
    key: 'acknowledgedStagingFirst',
    label: 'Staging-first only',
    hint: 'This request provisions to staging; production provisioning requires a separate council-approved path.',
  },
  {
    key: 'acknowledgedCustomDomain',
    label: 'Custom domain ready',
    hint: 'No .workers.dev URL will be surfaced to end users — a branded custom domain is staged.',
  },
];

const WORKFLOW_STAGES: Array<{ id: WorkflowStage; label: string }> = [
  { id: 'browse', label: 'Browse' },
  { id: 'configure', label: 'Configure' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'previewed', label: 'Previewed' },
  { id: 'confirmed-for-handoff', label: 'Handoff' },
  { id: 'staging-provision-requested', label: 'Staging' },
];

const STATUS_TERMINAL: ReadonlySet<ProvisionRequestRecord['status']> = new Set([
  'succeeded',
  'failed',
  'withdrawn',
]);

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
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
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
  const [proofGates, setProofGates] = useState<ProofGateState>(() => emptyProofGateState());
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionResponse, setProvisionResponse] = useState<ProvisionResponse | null>(null);
  const [provisionConfirmOpen, setProvisionConfirmOpen] = useState(false);
  const [copied, setCopied] = useState<'json' | 'hash' | null>(null);
  const [liveRequest, setLiveRequest] = useState<ProvisionRequestRecord | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CapabilityCatalogResponse>('/capabilities');
      setCatalog(data);
      setSelectedConceptId((current) => current ?? data.concepts[0]?.id ?? null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Stage C: poll provision request status until terminal state
  useEffect(() => {
    const requestId = provisionResponse?.request.id;
    if (!requestId) return;
    if (liveRequest && STATUS_TERMINAL.has(liveRequest.status)) return;

    const controller = new AbortController();
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const data = await apiFetch<{ request: ProvisionRequestRecord }>(
          `/capabilities/provision-requests/${requestId}`,
        );
        if (!cancelled) {
          setLiveRequest(data.request);
          if (!STATUS_TERMINAL.has(data.request.status)) {
            window.setTimeout(poll, 8000);
          }
        }
      } catch {
        if (!cancelled) {
          window.setTimeout(poll, 15000);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [provisionResponse?.request.id, liveRequest]);

  const selectedConcept = useMemo(
    () => catalog?.concepts.find((concept) => concept.id === selectedConceptId) ?? null,
    [catalog, selectedConceptId],
  );

  // Stage D: collect all unique tags across concepts
  const allTags = useMemo(() => {
    if (!catalog) return [];
    const tagSet = new Set<string>();
    for (const concept of catalog.concepts) {
      for (const tag of concept.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [catalog]);

  const filteredConcepts = useMemo(() => {
    if (!catalog) return [];
    if (!activeTagFilter) return catalog.concepts;
    return catalog.concepts.filter((c) => c.tags.includes(activeTagFilter));
  }, [catalog, activeTagFilter]);

  function resetDownstreamState() {
    setResolution(null);
    setResolutionError(null);
    setPreview(null);
    setPreviewError(null);
    setHandoffPackage(null);
    setHandoffError(null);
    setHandoffConfirmed(false);
    setProofGates(emptyProofGateState());
    setProvisionError(null);
    setProvisionResponse(null);
    setProvisionConfirmOpen(false);
    setLiveRequest(null);
  }

  useEffect(() => {
    if (!selectedConcept) {
      setFormValues({});
      return;
    }
    setFormValues(initializeCapabilityFormValues(selectedConcept));
    resetDownstreamState();
  }, [selectedConcept]);

  useEffect(() => {
    if (!selectedConcept) return;
    if (resolution || preview || handoffPackage || provisionResponse) {
      resetDownstreamState();
    }
  }, [formValues, selectedConcept]);

  const workflowStage = useMemo(
    () =>
      deriveCapabilityWorkflowStage({
        selectedConceptId,
        resolution,
        preview,
        handoffConfirmed,
        provisionRequested: Boolean(provisionResponse),
      }),
    [handoffConfirmed, preview, resolution, selectedConceptId, provisionResponse],
  );

  async function resolveConcept() {
    if (!selectedConcept) return;
    setResolving(true);
    setResolution(null);
    setResolutionError(null);
    setPreview(null);
    setPreviewError(null);
    setHandoffConfirmed(false);
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
    setProofGates(emptyProofGateState());
    setProvisionResponse(null);
    setLiveRequest(null);
    try {
      const response = await apiFetch<{ generatedAt: string; handoff: CapabilityScaffoldHandoff }>(
        '/capabilities/handoff',
        {
          method: 'POST',
          body: JSON.stringify({ conceptId: selectedConcept.id, params: formValues }),
        },
      );
      setHandoffPackage(response.handoff);
    } catch (err) {
      setHandoffError(extractErrorMessage(err));
    } finally {
      setHandoffInProgress(false);
    }
  }

  async function requestStagingProvision() {
    if (!handoffPackage?.id) return;
    setProvisioning(true);
    setProvisionError(null);
    try {
      const response = await apiFetch<ProvisionResponse>('/capabilities/provision-staging', {
        method: 'POST',
        confirmed: true,
        body: JSON.stringify({
          handoffId: handoffPackage.id,
          proofGates,
        }),
      });
      setProvisionResponse(response);
      setProvisionConfirmOpen(false);
    } catch (err) {
      setProvisionError(extractErrorMessage(err));
    } finally {
      setProvisioning(false);
    }
  }

  function copyHandoff(format: 'json' | 'hash') {
    if (!handoffPackage) return;
    const text =
      format === 'json'
        ? JSON.stringify(handoffPackage, null, 2)
        : handoffPackage.hash ?? '';
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopied(format);
    window.setTimeout(() => setCopied(null), 1500);
  }

  function downloadHandoff() {
    if (!handoffPackage) return;
    const blob = new Blob([JSON.stringify(handoffPackage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = `handoff-${handoffPackage.recipeId}-${handoffPackage.hash?.slice(0, 8) ?? 'preview'}.json`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const allProofGates = useMemo(
    () => PROOF_GATE_LABELS.every(({ key }) => proofGates[key]),
    [proofGates],
  );

  const conceptTemplates = selectedConcept?.templates ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Capability Design Studio</h1>
          <p className="text-sm text-slate-400">
            Governed concept menu backed by the on-disk capability registry. Configure → resolve → preview →
            confirm handoff → request staging provision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StagingFirstBadge />
          <Button variant="outline" size="sm" onClick={() => void loadCatalog()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
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

      <WorkflowStageIndicator current={workflowStage} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          {/* Stage D: tag filter rail */}
          {allTags.length > 0 && (
            <div className="rounded border border-slate-800 bg-slate-900 p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Filter by tag
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTagFilter(null)}
                  className={`rounded px-2 py-0.5 text-xs transition-colors ${
                    activeTagFilter === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      activeTagFilter === tag
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded border border-slate-800 bg-slate-900 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Concepts {activeTagFilter ? `· ${activeTagFilter}` : ''}
            </h2>
            <div className="space-y-2">
              {filteredConcepts.map((concept) => {
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
                      <div className="flex items-center gap-1">
                        {concept.recipes[0]?.version && (
                          <span className="font-mono text-[10px] text-slate-500">
                            v{concept.recipes[0].version}
                          </span>
                        )}
                        <MaturityBadge maturity={concept.maturity} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{concept.summary}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-[11px] uppercase tracking-wide text-amber-300/80">
                        {concept.approvalTier}
                      </span>
                      {concept.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
              {filteredConcepts.length === 0 && (
                <p className="text-xs text-slate-500">No concepts match the active filter.</p>
              )}
            </div>
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
                  <MaturityBadge maturity={selectedConcept.maturity} />
                  {selectedConcept.recipes[0]?.version && (
                    <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-xs text-slate-400">
                      recipe v{selectedConcept.recipes[0].version}
                    </span>
                  )}
                  <span className="font-mono text-xs text-slate-500">{selectedConcept.id}</span>
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

              {/* Stage D: guided composition templates */}
              {conceptTemplates.length > 0 && (
                <GuidedTemplateSelector
                  templates={conceptTemplates}
                  onApply={(values) =>
                    setFormValues((current) => ({ ...current, ...values }))
                  }
                />
              )}

              {/* Recipe variant comparison — only shown when multiple recipes exist and any carry tradeoffs */}
              {selectedConcept.recipes.length > 1 && selectedConcept.recipes.some((r) => r.tradeoffs) && (
                <div className="rounded border border-slate-700 bg-slate-900/40 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Recipe Variants
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedConcept.recipes.map((recipe) => (
                      <div key={recipe.id} className="rounded border border-slate-700/60 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-slate-200">{recipe.id}</span>
                          <MaturityBadge maturity={recipe.maturity} />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{recipe.summary}</p>
                        {recipe.tradeoffs && (
                          <p className="mt-2 text-xs text-amber-300/80">{recipe.tradeoffs}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                <ResolutionPanel
                  resolution={resolution}
                  tradeoffs={
                    selectedConcept.recipes.find((r) => r.id === resolution.recipe.id)?.tradeoffs
                  }
                />
              )}

              {preview && <PreviewPanel preview={preview} />}

              <ActionRail
                preview={preview}
                handoffConfirmed={handoffConfirmed}
                setHandoffConfirmed={setHandoffConfirmed}
                handoffInProgress={handoffInProgress}
                handoffPackage={handoffPackage}
                handoffError={handoffError}
                onGenerateHandoff={() => void generateHandoff()}
              />

              {handoffPackage && (
                <HandoffPanel
                  handoff={handoffPackage}
                  copied={copied}
                  onCopy={copyHandoff}
                  onDownload={downloadHandoff}
                />
              )}

              {handoffPackage && (
                <ProofGatePanel
                  handoff={handoffPackage}
                  gates={proofGates}
                  setGate={(key, value) => setProofGates((cur) => ({ ...cur, [key]: value }))}
                  allConfirmed={allProofGates}
                  provisioning={provisioning}
                  provisionError={provisionError}
                  provisionResponse={provisionResponse}
                  confirmOpen={provisionConfirmOpen}
                  setConfirmOpen={setProvisionConfirmOpen}
                  onRequestProvision={() => void requestStagingProvision()}
                />
              )}

              {/* Stage C: deployment evidence panel — visible once provision is requested */}
              {provisionResponse && (
                <DeploymentEvidencePanel
                  provisionResponse={provisionResponse}
                  liveRequest={liveRequest}
                />
              )}

              {/* Stage D: lineage history — past handoffs for this concept */}
              <ConceptHistoryPanel conceptId={selectedConcept.id} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StagingFirstBadge() {
  return (
    <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
      Staging-first only
    </span>
  );
}

/** Stage D: maturity badge with color-coded tier. */
function MaturityBadge({ maturity }: { maturity: string }) {
  const colorClass =
    maturity === 'stable'
      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
      : maturity === 'beta'
        ? 'bg-blue-950/60 text-blue-300 border-blue-800/60'
        : 'bg-amber-950/60 text-amber-300 border-amber-800/60';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${colorClass}`}>
      {maturity}
    </span>
  );
}

/** Stage D: guided composition template selector. */
function GuidedTemplateSelector({
  templates,
  onApply,
}: {
  templates: ConceptTemplate[];
  onApply: (values: Record<string, string | number | boolean>) => void;
}) {
  const [applied, setApplied] = useState<string | null>(null);

  function apply(template: ConceptTemplate) {
    onApply(template.values);
    setApplied(template.id);
    window.setTimeout(() => setApplied(null), 1500);
  }

  return (
    <div className="rounded border border-slate-700/60 bg-slate-950/60 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Guided Templates
      </h3>
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            title={template.hint}
            onClick={() => apply(template)}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:border-blue-600/60 hover:bg-blue-950/30 hover:text-white"
          >
            {applied === template.id ? '✓ Applied' : template.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-600">
        Templates pre-fill parameters for common scenarios. Adjust as needed before resolving.
      </p>
    </div>
  );
}

function WorkflowStageIndicator({ current }: { current: WorkflowStage }) {
  const currentIdx = WORKFLOW_STAGES.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
      {WORKFLOW_STAGES.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <li key={stage.id} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold ${
                done
                  ? 'border-emerald-500/60 bg-emerald-950/60 text-emerald-200'
                  : active
                    ? 'border-blue-400/70 bg-blue-950/70 text-blue-200'
                    : 'border-slate-700 bg-slate-950 text-slate-500'
              }`}
            >
              {done ? '✓' : idx + 1}
            </span>
            <span
              className={
                active
                  ? 'font-semibold uppercase tracking-wider text-blue-200'
                  : done
                    ? 'uppercase tracking-wider text-emerald-200/80'
                    : 'uppercase tracking-wider text-slate-500'
              }
            >
              {stage.label}
            </span>
            {idx < WORKFLOW_STAGES.length - 1 && (
              <span className="mx-1 text-slate-700">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ResolutionPanel({
  resolution,
  tradeoffs,
}: {
  resolution: CapabilityResolutionResponse;
  tradeoffs?: string;
}) {
  return (
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
      {tradeoffs && (
        <div className="mt-3 rounded border border-amber-800/40 bg-amber-950/20 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">When to choose this recipe</p>
          <p className="mt-1 text-xs text-slate-300">{tradeoffs}</p>
        </div>
      )}
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
  );
}

function PreviewPanel({ preview }: { preview: CapabilityPreviewResponse }) {
  return (
    <div className="rounded border border-blue-800/60 bg-blue-950/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Plan Preview</h3>
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
        <InfoCard title="Required Secrets" values={preview.plan.env.secrets} />
        <InfoCard title="Required Vars" values={preview.plan.env.vars} />
        <InfoCard title="Required Bindings" values={preview.plan.bindings.required} />
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
      <details className="mt-4 rounded border border-slate-800 bg-slate-950/80 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
          Rendered preview (markdown)
        </summary>
        <div className="mt-3">
          <MarkdownPreview source={preview.preview} />
        </div>
      </details>
    </div>
  );
}

function ActionRail({
  preview,
  handoffConfirmed,
  setHandoffConfirmed,
  handoffInProgress,
  handoffPackage,
  handoffError,
  onGenerateHandoff,
}: {
  preview: CapabilityPreviewResponse | null;
  handoffConfirmed: boolean;
  setHandoffConfirmed: (next: boolean) => void;
  handoffInProgress: boolean;
  handoffPackage: CapabilityScaffoldHandoff | null;
  handoffError: string | null;
  onGenerateHandoff: () => void;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Action Rail</h3>
      <div className="mt-3 space-y-3 text-sm text-slate-400">
        <p>
          Resolve and preview are reversible. Scaffold handoff stays disabled until the plan has been
          reviewed.
        </p>
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
            onClick={onGenerateHandoff}
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
  );
}

function HandoffPanel({
  handoff,
  copied,
  onCopy,
  onDownload,
}: {
  handoff: CapabilityScaffoldHandoff;
  copied: 'json' | 'hash' | null;
  onCopy: (format: 'json' | 'hash') => void;
  onDownload: () => void;
}) {
  return (
    <div className="rounded border border-violet-800/60 bg-violet-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-200">
            Scaffold Handoff Package
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            Deterministic, content-addressable artifact for the next scaffold or provision step.
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-300 sm:grid-cols-[max-content_1fr]">
            <dt className="text-slate-500">Concept</dt>
            <dd className="font-mono">{handoff.conceptId}</dd>
            <dt className="text-slate-500">Recipe</dt>
            <dd className="font-mono">{handoff.recipeId}</dd>
            {handoff.id && (
              <>
                <dt className="text-slate-500">Handoff ID</dt>
                <dd className="font-mono">{handoff.id}</dd>
              </>
            )}
            {handoff.hash && (
              <>
                <dt className="text-slate-500">Content hash</dt>
                <dd className="font-mono break-all">{handoff.hash}</dd>
              </>
            )}
            {handoff.createdAt && (
              <>
                <dt className="text-slate-500">Created at</dt>
                <dd>{new Date(handoff.createdAt).toLocaleString()}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onCopy('json')}>
            {copied === 'json' ? 'Copied!' : 'Copy JSON'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!handoff.hash}
            onClick={() => onCopy('hash')}
          >
            {copied === 'hash' ? 'Copied!' : 'Copy hash'}
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}>
            Download
          </Button>
        </div>
      </div>
      <details className="mt-4 rounded border border-slate-800 bg-slate-950/80">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Raw handoff JSON
        </summary>
        <pre className="overflow-x-auto p-3 text-xs text-slate-200 whitespace-pre-wrap">
          {JSON.stringify(handoff, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ProofGatePanel({
  handoff,
  gates,
  setGate,
  allConfirmed,
  provisioning,
  provisionError,
  provisionResponse,
  confirmOpen,
  setConfirmOpen,
  onRequestProvision,
}: {
  handoff: CapabilityScaffoldHandoff;
  gates: ProofGateState;
  setGate: (key: keyof ProofGateState, value: boolean) => void;
  allConfirmed: boolean;
  provisioning: boolean;
  provisionError: string | null;
  provisionResponse: ProvisionResponse | null;
  confirmOpen: boolean;
  setConfirmOpen: (next: boolean) => void;
  onRequestProvision: () => void;
}) {
  const isPersisted = Boolean(handoff.id);

  return (
    <div className="rounded border border-amber-800/60 bg-amber-950/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-200">
            Proof Gate — Staging Provision Request
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            Every gate below must be acknowledged before a staging-provision request is allowed.
            This request is audited as <span className="font-mono">manual-rollback</span>; it does not
            automatically mutate Cloudflare or Neon.
          </p>
        </div>
      </div>

      {!isPersisted && (
        <div className="mt-3 rounded border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
          Provision requests require a persisted handoff. Regenerate the handoff above with a signed-in
          session to obtain a handoff id.
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {PROOF_GATE_LABELS.map(({ key, label, hint }) => (
          <li key={key}>
            <label className="flex items-start gap-2 rounded border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={gates[key]}
                onChange={(event) => setGate(key, event.target.checked)}
                disabled={!isPersisted || provisioning || Boolean(provisionResponse)}
              />
              <span className="flex-1">
                <span className="font-medium">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={!isPersisted || !allConfirmed || provisioning || Boolean(provisionResponse)}
          onClick={() => setConfirmOpen(true)}
        >
          Request Staging Provision
        </Button>
        <span className="text-xs text-slate-500">
          {provisionResponse
            ? 'Staging provision request recorded.'
            : allConfirmed
              ? 'All gates confirmed — request will require one more confirmation.'
              : 'Confirm every proof gate to enable the request.'}
        </span>
      </div>

      {confirmOpen && !provisionResponse && (
        <div className="mt-4 rounded border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-100">
          <p className="font-semibold">Confirm staging provision request</p>
          <p className="mt-1 text-amber-100/80">
            A row will be inserted into <span className="font-mono">capability_provision_requests</span>{' '}
            with status <span className="font-mono">requested</span>. Downstream automation may dispatch
            scaffold + deploy against staging only.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={provisioning}
              onClick={onRequestProvision}
            >
              {provisioning ? 'Requesting…' : 'Confirm — submit request'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {provisionError && (
        <div className="mt-4 rounded border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {provisionError}
        </div>
      )}

      {provisionResponse && (
        <div className="mt-4 rounded border border-emerald-700/60 bg-emerald-950/30 p-3 text-sm text-emerald-100">
          <p className="font-semibold">Staging provision request recorded.</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
            <dt className="text-emerald-300/70">Request ID</dt>
            <dd className="font-mono">{provisionResponse.request.id}</dd>
            <dt className="text-emerald-300/70">Status</dt>
            <dd className="font-mono">{provisionResponse.request.status}</dd>
            <dt className="text-emerald-300/70">Handoff hash</dt>
            <dd className="font-mono break-all">{provisionResponse.handoff.hash}</dd>
            <dt className="text-emerald-300/70">Next step</dt>
            <dd className="font-mono">{provisionResponse.nextStep.action}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

/** Stage C: deployment evidence panel. Polls /capabilities/provision-requests/:id. */
function DeploymentEvidencePanel({
  provisionResponse,
  liveRequest,
}: {
  provisionResponse: ProvisionResponse;
  liveRequest: ProvisionRequestRecord | null;
}) {
  const status = liveRequest?.status ?? provisionResponse.request.status;
  const notes = liveRequest?.notes ?? null;
  const isTerminal = STATUS_TERMINAL.has(status as ProvisionRequestRecord['status']);

  const statusColor =
    status === 'succeeded'
      ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-100'
      : status === 'failed'
        ? 'border-red-700/60 bg-red-950/30 text-red-100'
        : status === 'withdrawn'
          ? 'border-slate-700 bg-slate-950/50 text-slate-400'
          : 'border-blue-700/60 bg-blue-950/30 text-blue-100';

  const statusDot =
    status === 'succeeded'
      ? '✓'
      : status === 'failed'
        ? '✗'
        : status === 'withdrawn'
          ? '—'
          : '…';

  return (
    <div className={`rounded border p-4 ${statusColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            Deployment Evidence
          </h3>
          <p className="mt-1 text-xs opacity-70">
            {isTerminal
              ? 'Provision lifecycle complete.'
              : 'Polling for provision request status updates…'}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide bg-black/20">
          {statusDot} {status}
        </span>
      </div>

      <dl className="mt-4 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
        <dt className="opacity-60">Request ID</dt>
        <dd className="font-mono">{provisionResponse.request.id}</dd>
        <dt className="opacity-60">Handoff</dt>
        <dd className="font-mono">{provisionResponse.handoff.conceptId} / {provisionResponse.handoff.recipeId}</dd>
        <dt className="opacity-60">Requested at</dt>
        <dd>{new Date(provisionResponse.request.requestedAt).toLocaleString()}</dd>
      </dl>

      {/* Provision lifecycle timeline */}
      <div className="mt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
          Lifecycle
        </h4>
        <ol className="flex flex-wrap gap-2 text-xs">
          {(['requested', 'acknowledged', 'dispatched', 'succeeded'] as const).map((step) => {
            const order = ['requested', 'acknowledged', 'dispatched', 'succeeded', 'failed', 'withdrawn'];
            const currentIdx = order.indexOf(status);
            const stepIdx = order.indexOf(step);
            const done = stepIdx <= currentIdx && status !== 'failed' && status !== 'withdrawn';
            const active = step === status;
            return (
              <li key={step} className="flex items-center gap-1.5">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold ${
                    done
                      ? 'border-emerald-500/60 bg-emerald-950/80 text-emerald-200'
                      : active
                        ? 'border-blue-400/70 bg-blue-950/80 text-blue-200'
                        : 'border-slate-700 bg-slate-950 text-slate-600'
                  }`}
                >
                  {done ? '✓' : stepIdx + 1}
                </span>
                <span className={done || active ? 'opacity-100' : 'opacity-40'}>{step}</span>
                {step !== 'succeeded' && <span className="opacity-30">→</span>}
              </li>
            );
          })}
        </ol>
        {status === 'failed' && (
          <p className="mt-2 rounded border border-red-800/60 bg-red-950/30 px-2 py-1 text-xs text-red-200">
            Provision failed. Check the GitHub Actions run log for the scaffold error.
          </p>
        )}
      </div>

      {notes && (
        <div className="mt-3 rounded border border-slate-700/50 bg-black/20 p-2">
          <span className="text-xs opacity-60">Notes: </span>
          <span className="text-xs">{notes}</span>
        </div>
      )}

      {status === 'succeeded' && (
        <div className="mt-3 rounded border border-emerald-700/40 bg-emerald-950/20 p-2 text-xs">
          Scaffold artifact uploaded to GitHub Actions. Retrieve it from the workflow run to inspect
          the generated app structure before promoting to a branch.
        </div>
      )}
    </div>
  );
}

/** Stage D: collapsible lineage history — shows last 5 handoffs for the selected concept. */
function ConceptHistoryPanel({ conceptId }: { conceptId: string }) {
  const [open, setOpen] = useState(false);
  const [handoffs, setHandoffs] = useState<CapabilityScaffoldHandoff[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setHandoffs(null);
    setFetchError(null);
  }, [conceptId]);

  async function load() {
    if (loading || handoffs !== null) return;
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<{ handoffs: CapabilityScaffoldHandoff[] }>(
        `/capabilities/handoffs?conceptId=${encodeURIComponent(conceptId)}&limit=5`,
      );
      setHandoffs(
        (data.handoffs ?? []).filter((h) => h.conceptId === conceptId).slice(0, 5),
      );
    } catch (err) {
      setFetchError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-950/60">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
      >
        <span>Lineage history</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800 px-4 py-3">
          {loading && <p className="text-xs text-slate-500">Loading handoff history…</p>}
          {fetchError && <p className="text-xs text-red-400">{fetchError}</p>}
          {!loading && handoffs !== null && handoffs.length === 0 && (
            <p className="text-xs text-slate-500">No handoffs recorded for this concept yet.</p>
          )}
          {!loading && handoffs && handoffs.length > 0 && (
            <ul className="space-y-2">
              {handoffs.map((h) => (
                <li
                  key={h.id ?? h.hash}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-mono text-slate-300">{h.recipeId}</div>
                    {h.id && <div className="font-mono text-[10px] text-slate-500">{h.id}</div>}
                  </div>
                  <div className="text-right text-slate-500">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString() : '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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

/**
 * Minimal markdown renderer for the deterministic subset emitted by
 * `renderCapabilityPlanPreview` in admin-studio: `#`, `##` headings,
 * `- ` bullets (top-level and one nested level), and plain paragraphs.
 *
 * Inline `**bold**` and `` `code` `` are recognized. Anything else falls
 * through as plain text — no HTML injection, no third-party renderer.
 */
function MarkdownPreview({ source }: { source: string }) {
  return <div className="space-y-2 text-sm text-slate-200">{renderMarkdownBlocks(source)}</div>;
}

function renderMarkdownBlocks(source: string): ReactNode[] {
  const lines = source.split('\n');
  const out: ReactNode[] = [];
  let buffer: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  function flushList() {
    if (listItems.length > 0) {
      out.push(
        <ul key={`ul-${out.length}`} className="ml-4 list-disc space-y-1 text-slate-300">
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  }

  function flushParagraph() {
    if (buffer.length > 0) {
      out.push(
        <p key={`p-${out.length}`} className="text-slate-300">
          {buffer}
        </p>,
      );
      buffer = [];
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    if (raw.startsWith('# ')) {
      flushParagraph();
      flushList();
      out.push(
        <h2 key={`h2-${i}`} className="mt-2 text-base font-semibold text-white">
          {renderMarkdownInline(raw.slice(2))}
        </h2>,
      );
      continue;
    }
    if (raw.startsWith('## ')) {
      flushParagraph();
      flushList();
      out.push(
        <h3 key={`h3-${i}`} className="mt-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          {renderMarkdownInline(raw.slice(3))}
        </h3>,
      );
      continue;
    }
    if (raw.startsWith('- ')) {
      flushParagraph();
      listItems.push(<li key={`li-${i}`}>{renderMarkdownInline(raw.slice(2))}</li>);
      continue;
    }
    if (raw.startsWith('  - ')) {
      flushParagraph();
      listItems.push(
        <li key={`li-nested-${i}`} className="ml-4">
          {renderMarkdownInline(raw.slice(4))}
        </li>,
      );
      continue;
    }
    flushList();
    buffer.push(renderMarkdownInline(raw));
    buffer.push(' ');
  }
  flushParagraph();
  flushList();
  return out;
}

function renderMarkdownInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let cursor = 0;
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      out.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      out.push(
        <strong key={`b-${match.index}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <code
          key={`c-${match.index}`}
          className="rounded bg-slate-900 px-1 py-0.5 font-mono text-xs text-amber-200"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    out.push(text.slice(cursor));
  }
  return <>{out}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported helpers (also used by tests)
// ─────────────────────────────────────────────────────────────────────────────

export function castFormValue(
  type: CapabilityParameterDefinition['type'],
  value: string,
): string | number | boolean {
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
  provisionRequested = false,
}: {
  selectedConceptId: string | null;
  resolution: CapabilityResolutionResponse | null;
  preview: CapabilityPreviewResponse | null;
  handoffConfirmed: boolean;
  provisionRequested?: boolean;
}): WorkflowStage {
  if (!selectedConceptId) return 'browse';
  if (provisionRequested) return 'staging-provision-requested';
  if (preview && handoffConfirmed) return 'confirmed-for-handoff';
  if (preview) return 'previewed';
  if (resolution) return 'resolved';
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

export function emptyProofGateState(): ProofGateState {
  return {
    reviewedPlan: false,
    reviewedEnvContract: false,
    reviewedSmokeChecks: false,
    acknowledgedStagingFirst: false,
    acknowledgedCustomDomain: false,
  };
}

export function isProofGateComplete(state: ProofGateState): boolean {
  return PROOF_GATE_LABELS.every(({ key }) => state[key]);
}
