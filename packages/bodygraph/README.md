# @latimer-woods-tech/bodygraph

The **canonical Energy Blueprint body-graph engine** — a single, themeable,
runtime-agnostic renderer that returns an **SVG string**. Pure TypeScript, zero
runtime dependencies.

This package unifies the three divergent body-graph renderers (film, web, PDF)
onto one engine so a chart looks identical everywhere.

## Usage

```ts
import { renderBodyGraph } from '@latimer-woods-tech/bodygraph';

const svg = renderBodyGraph(
  {
    definedCenters: ['G', 'Throat', 'Ajna'],
    // Precise activations drive badge colors...
    gateActivations: { 20: { personality: true, design: true } },
    // ...or fall back to signatureGates (marked as "both") when absent:
    signatureGates: [20, 57],
    transitGates: [16],
  },
  // Optional partial theme (merged over the premium-clean default).
  { accent: '#7aa2ff', glow: '#7aa2ff' },
  // Optional render flags.
  { showGateBadges: true, glow: true, interactiveAttrs: false, idSuffix: '-hero' },
);
```

## Design contract

- **Crisp always.** Center shapes, gate badges, and gate numbers are razor-sharp.
- **Soft halo behind, never on.** The glow for a defined center is a *separate
  blurred layer rendered under* the crisp shape, so the halo never softens the
  number or the edge.
- **Defined channels lit.** A channel whose two ends are both defined glows in
  the accent (thicker, brighter); undefined channels stay quiet.
- **Open centers** get a quiet, clean outline.

## API

- `renderBodyGraph(input, theme?, options?) => string` — SVG markup.
- `DEFAULT_THEME`, `resolveTheme(input?)` — the themeable design system.
- Geometry exports (`CENTER_POS`, `CHANNEL_LINES`, `CENTER_GATES`,
  `GATE_TO_CENTER`, `GATE_OFFSETS`, `centerShapePoints`, …) so consumers can
  place motion / overlays.

### `input`

| field | type | notes |
| --- | --- | --- |
| `definedCenters` | `string[]` | PascalCase keys (`G`, `Throat`, `SolarPlexus`). |
| `gateActivations?` | `Record<number, { personality?, design? }>` | precise badge colors. |
| `signatureGates?` | `number[]` | fallback when `gateActivations` absent → "both". |
| `transitGates?` | `number[]` | colored with the transit badge. |

### `options`

| flag | default | notes |
| --- | --- | --- |
| `showGateBadges` | `true` | draw gate-number badges. |
| `glow` | `true` | soft halo behind defined centers (film). |
| `interactiveAttrs` | `false` | emit `data-*` hooks (web). |
| `idSuffix` | `''` | namespaces gradient/filter ids for multiple SVGs per page. |

## Coordinate system

A **300×420 viewBox**, ported verbatim from the canonical selfprime web
generator. The geometry/data is copied into this package so it is fully
self-contained (no selfprime import).
