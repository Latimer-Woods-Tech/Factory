import { create } from 'zustand';
import { apiFetch } from '../lib/api.js';

export type Tier = 'free' | 'pro' | 'enterprise';

interface EntitlementsState {
  tier: Tier;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useEntitlements = create<EntitlementsState>((set) => ({
  tier: 'free',
  loaded: false,
  load: async () => {
    try {
      const data = await apiFetch<{ tier: Tier }>('/me/entitlements');
      set({ tier: data.tier, loaded: true });
    } catch {
      set({ tier: 'free', loaded: true });
    }
  },
}));

export function useEntitlement(requiredTier: Tier): { allowed: boolean; tier: Tier; requiredTier: Tier } {
  const { tier } = useEntitlements();
  const tierOrder: Tier[] = ['free', 'pro', 'enterprise'];
  const allowed = tierOrder.indexOf(tier) >= tierOrder.indexOf(requiredTier);
  return { allowed, tier, requiredTier };
}
