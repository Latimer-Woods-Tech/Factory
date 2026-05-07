import type { FlagClient, FlagKey, FlagsEnv, FlagsbindingType } from './types.js';

/** Values to override for specific flag keys in tests. */
export type MockFlagValues = Record<string, boolean | string | number | object>;

/**
 * Create a synchronous mock FlagClient for unit tests.
 * @param overrides  Map of flag key → value to return instead of the fallback.
 */
export function createMockFlagClient(overrides: MockFlagValues = {}): FlagClient {
  return {
    boolean: (k: FlagKey, fb: boolean) => Promise.resolve(k in overrides ? Boolean(overrides[k]) : fb),
    killSwitch: (k: FlagKey) => Promise.resolve(k in overrides ? Boolean(overrides[k]) : true),
    string: (k: FlagKey, fb: string) => Promise.resolve(k in overrides ? String(overrides[k]) : fb),
    number: (k: FlagKey, fb: number) => Promise.resolve(k in overrides ? Number(overrides[k]) : fb),
    json: <T>(k: FlagKey, fb: T): Promise<T> =>
      Promise.resolve(k in overrides ? (overrides[k] as T) : fb),
  };
}

/**
 * Create a mock FlagsEnv binding for unit tests.
 * @param overrides  Map of flag key → value to return instead of the default.
 */
export function createMockFlagsEnv(overrides: MockFlagValues = {}): FlagsEnv {
  const get = (k: string, d: unknown): Promise<unknown> =>
    Promise.resolve(k in overrides ? overrides[k] : d);

  const FLAGS: FlagsbindingType = {
    getBooleanValue: (k: string, d: boolean) => get(k, d) as Promise<boolean>,
    getStringValue:  (k: string, d: string)  => get(k, d) as Promise<string>,
    getNumberValue:  (k: string, d: number)  => get(k, d) as Promise<number>,
    getJSONValue:    <T>(k: string, d: T)    => get(k, d) as Promise<T>,
  };

  return {
    ENVIRONMENT: 'test',
    FLAGS,
    FLAG_TELEMETRY: undefined,
  };
}
