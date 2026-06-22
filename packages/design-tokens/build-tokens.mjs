/**
 * Primus token build — DTCG JSON source → CSS variables, flat JSON, ESM module,
 * and a Tailwind preset. Run before tsup (see package.json `build`).
 *
 * Design choice: only the `name/kebab` transform is applied, so token VALUES pass
 * through byte-for-byte from the DTCG `$value`. This keeps the generated outputs an
 * exact mirror of the hand-written TS token API and lets src/parity.test.ts assert it.
 */
import StyleDictionary from 'style-dictionary';

/** DTCG top-level category → Tailwind `theme.extend` key. */
const TAILWIND_CATEGORY = {
  color: 'colors',
  spacing: 'spacing',
  radii: 'borderRadius',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'line-height': 'lineHeight',
  'letter-spacing': 'letterSpacing',
  'font-family': 'fontFamily',
  shadow: 'boxShadow',
  breakpoint: 'screens',
  duration: 'transitionDuration',
  easing: 'transitionTimingFunction',
};

const tokenValue = (t) => (t.value !== undefined ? t.value : t.original?.$value);

StyleDictionary.registerFormat({
  name: 'primus/tailwind-preset',
  format: ({ dictionary }) => {
    const extend = {};
    for (const token of dictionary.allTokens) {
      const [category, ...rest] = token.path;
      const twKey = TAILWIND_CATEGORY[category];
      if (!twKey) continue;
      const key = rest.join('-');
      (extend[twKey] ??= {})[key] = tokenValue(token);
    }
    return `/** Primus Tailwind preset — generated from DTCG tokens. Do not edit. */\nmodule.exports = ${JSON.stringify(
      { theme: { extend } },
      null,
      2,
    )};\n`;
  },
});

const sd = new StyleDictionary({
  source: ['tokens/**/*.json'],
  usesDtcg: true,
  platforms: {
    css: {
      transforms: ['name/kebab'],
      buildPath: 'dist/',
      options: { usesDtcg: true },
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: { selector: ':root' },
        },
      ],
    },
    json: {
      transforms: ['name/kebab'],
      buildPath: 'dist/',
      options: { usesDtcg: true },
      files: [
        { destination: 'tokens.flat.json', format: 'json/flat' },
        { destination: 'tokens.generated.mjs', format: 'javascript/esm' },
      ],
    },
    tailwind: {
      transforms: ['name/kebab'],
      buildPath: 'dist/',
      options: { usesDtcg: true },
      files: [{ destination: 'tailwind.preset.cjs', format: 'primus/tailwind-preset' }],
    },
  },
});

await sd.buildAllPlatforms();
console.log('Primus tokens built: dist/tokens.css, dist/tokens.flat.json, dist/tokens.generated.mjs, dist/tailwind.preset.cjs');
