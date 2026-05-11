# @latimer-woods-tech/tsconfig-base

Shared TypeScript configs.

## Use

```json
// Worker package
{ "extends": "@latimer-woods-tech/tsconfig-base/worker.json" }
```

```json
// Library package
{ "extends": "@latimer-woods-tech/tsconfig-base/lib.json" }
```

```json
// Other
{ "extends": "@latimer-woods-tech/tsconfig-base/base.json" }
```

All variants enable `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and target ES2022 with `module: ESNext` / `moduleResolution: bundler`.
