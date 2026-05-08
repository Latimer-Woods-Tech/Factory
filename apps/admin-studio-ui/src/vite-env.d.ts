/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_BASE_LOCAL?: string;
  readonly VITE_API_BASE_STAGING?: string;
  readonly VITE_API_BASE_PROD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
