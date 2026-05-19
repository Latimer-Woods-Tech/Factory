/**
 * Minimal type shim for pixelmatch — the package ships no @types/ package
 * and the v6+ ESM-only build makes TS infer `any` for the dynamic import.
 * Local declaration here is consumed only by tsup's DTS step.
 */
declare module 'pixelmatch' {
  type Pixelmatch = (
    img1: Uint8Array,
    img2: Uint8Array,
    output: Uint8Array | null,
    width: number,
    height: number,
    opts?: { threshold?: number; includeAA?: boolean; alpha?: number },
  ) => number;
  const pixelmatch: Pixelmatch;
  export default pixelmatch;
  export = pixelmatch;
}
