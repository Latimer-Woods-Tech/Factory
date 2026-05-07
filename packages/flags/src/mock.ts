import type { FlagClient, FlagKey, FlagsEnv } from './types.js';
export type MockFlagValues = Record<string, boolean | string | number | object>;

export function createMockFlagClient(overrides: MockFlagValues = {}): FlagClient {
  return {
    boolean: async (k: FlagKey, fb: boolean) => k in overrides ? Boolean(overrides[k]) : fb,
    killSwitch: async (k: FlagKey) => k in overrides ? Boolean(overrides[k]) : true,
    string: async (k: FlagKey, fb: string) => k in overrides ? String(overrides[k]) : fb,
    number: async (k: FlagKey, fb: number) => k in overrides ? Number(overrides[k]) : fb,
    json: async (k: FlagKey, fb: any) => k in overrides ? overrides[k] : fb,
  };
}

export function createMockFlagsEnv(overrides: MockFlagValues = {}): FlagsEnv {
  const get = async (k: string, d: unknown) => k in overrides ? overrides[k] : d;
  return {
    ENVIRONMENT: 'test',
    FLAGS: { getBooleanValue: (k,d) => get(k,d) as any, getStringValue: (k,d) => get(k,d) as any, getNumberValue: (k,d) => get(k,d) as any, getJSONValue: (k,d) => get(k,d) as any } as any,
    FLAG_TELEMETRY: undefined,
  };
}
