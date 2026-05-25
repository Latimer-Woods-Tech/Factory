# Capability Factory Registry

The capability-factory registry is the deterministic control plane for app generation.

It exists to prevent a future planner, Studio UI, or operator workflow from assembling apps directly from informal prompts or undocumented package knowledge.

## Layers

The registry now has four explicit layers:

1. `primitives/`
   - Implementation substrate.
   - Describes reusable platform capabilities such as telephony, CRM, compliance, and analytics.
2. `recipes/`
   - Approved compositions.
   - Defines which primitives are combined, what surfaces they must expose, and which smoke checks and bindings are required.
3. `concepts/`
   - Governed menu layer.
   - Defines what humans or future planners are allowed to request, which recipes satisfy the request, which parameters are configurable, and what qualification rules apply.
4. `compiled/`
   - Generated artifacts.
   - Holds normalized plans, previews, golden-path contracts, and the compiled catalog consumed by higher-level tooling.

## Why Concepts Exist

Recipes are still too close to implementation.

A planner or UI should not infer configurability by inspecting package names, route lists, or env contracts. That creates drift and encourages unsafe composition.

Concepts solve that by making four things explicit:

1. The operator-facing name and summary.
2. The approved recipe candidates behind the concept.
3. The allowed parameter surface.
4. The qualification metadata required before the concept is shown or provisioned.

## Catalog Contract

The compiled catalog is the stable read model for any future builder surface.

The catalog should be the only source used to:

1. Render the capability menu.
2. Ask for configuration inputs.
3. Explain what a concept deploys.
4. Route a qualified request into a recipe compile or scaffold flow.

This keeps registry governance separate from UX experimentation.

## Resolution Flow

Concepts are not just display metadata. They are the approved input contract for execution.

The deterministic resolution flow is:

1. Load the concept.
2. Validate incoming parameters against the concept's declared parameter schema.
3. Reject unknown keys or invalid enum/type values.
4. Select an approved recipe candidate deterministically.
5. Optionally compile the selected recipe into the existing plan artifact.

That flow is what allows a future UI or planner to feel dynamic without allowing uncontrolled composition.

## LLM Boundary

If an LLM-assisted layer is introduced later, it should stay outside the deterministic registry.

Safe responsibilities for that layer:

1. Suggest draft concepts for review.
2. Propose parameter values within an approved concept schema.
3. Map natural-language user intent onto an existing approved concept.

Unsafe responsibilities for that layer:

1. Invent new deployable compositions without registry approval.
2. Bypass concept qualification.
3. Infer secrets, bindings, or compliance posture from prompts alone.

The rule is simple: LLMs may suggest, but the registry decides.
