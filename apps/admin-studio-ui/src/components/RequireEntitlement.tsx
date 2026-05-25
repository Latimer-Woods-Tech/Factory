/**
 * Route guard — renders children if tier allows; otherwise shows UpgradeNudge.
 * Covers #563 (SUP-2.3.3).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEntitlement } from '../stores/entitlements.js';
import { UpgradeNudge } from './UpgradeNudge.js';

interface Props {
  capability: string;
  capabilityLabel: string;
  requiredTier: 'pro' | 'enterprise';
  tierPrice: string;
  billingPortalUrl: string;
  children: ReactNode;
}

export function RequireEntitlement({
  capability,
  capabilityLabel,
  requiredTier,
  tierPrice,
  billingPortalUrl,
  children,
}: Props) {
  const { allowed } = useEntitlement(requiredTier);
  const [nudgeOpen, setNudgeOpen] = useState(!allowed);

  if (allowed) return <>{children}</>;

  return (
    <>
      {/* Blurred behind preview */}
      <div className="pointer-events-none select-none blur-sm opacity-40 min-h-[200px]">
        {children}
      </div>
      <UpgradeNudge
        capability={capability}
        capabilityLabel={capabilityLabel}
        requiredTier={requiredTier}
        tierPrice={tierPrice}
        billingPortalUrl={billingPortalUrl}
        open={nudgeOpen}
        onClose={() => setNudgeOpen(false)}
      />
    </>
  );
}
