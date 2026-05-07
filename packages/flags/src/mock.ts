import type { FlagClient, FlagKey, FlagsEnv, FlagsbindingType } from './types.js';

export type MockFlagValues = Record<string, boolean | string | number | object>;

export function createMockFlagClient(overrides: MockFlagValues = {}): FlagClient {
  return {
    boolean: async (k: FlagKey, fb: boolean) => k in overrides ? Boolean(overrides[k]) : fb,
    killSwitch: async (k: FlagKey) => k in overrides ? Boolean(overrides[k]) : true,
    string: async (k: FlagKey, fb: string) => k in overrides ? String(overrides[k]) : fb,
    number: async (k: FlagKey, fb: number) => k in overrides ? Number(overrides[k]) : fb,
    json: async <T>(k: FlagKey, fb: T): Promise<T> =>
      (k in overrides ? overrides[k] : fb) as T,
  };
}

export function createMockFlagsEnv(overrides: MockFlagValues = {}): FlagsEnv {
  const get = async (k: string, d: unknown): Promise<unknown> =>
    k in overrides ? overrides[k] : d;
  const FLAGS: FlagsbindingType = {
    getBooleanValue: (k, d) => get(k, d) as Promise<boolean>,
    getStringValue: (k, d) => get(k, d) as Promise<string>,
    getNumberValue: (k, d) => get(k, d) as Promise<number>,
    getJSONValue: <T>(k: string, d: T) => get(k, d) as Promise<T>,
  };
  return {
    ENVIRONMENT: 'test',
    FLAGS,
    FLAG_TELEMETRY: undefined,
  };
}
