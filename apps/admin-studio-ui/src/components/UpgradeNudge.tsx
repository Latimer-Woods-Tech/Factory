/**
 * UpgradeNudge — shown when a user hits a locked capability or clicks a locked tab.
 * Covers #564 (SUP-2.3.4).
 */
import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog.js';

export interface NudgeProps {
  capability: string;
  capabilityLabel: string;
  requiredTier: 'pro' | 'enterprise';
  tierPrice: string;
  open: boolean;
  onClose: () => void;
  billingPortalUrl: string;
}

const TIER_LABELS: Record<'pro' | 'enterprise', string> = {
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export function UpgradeNudge({
  capabilityLabel,
  requiredTier,
  tierPrice,
  open,
  onClose,
  billingPortalUrl,
}: NudgeProps) {
  const upgradeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => upgradeRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-sm bg-slate-900 border border-slate-700 text-white p-6 rounded-xl"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 shrink-0 text-xl">
              🔒
            </div>
            <div>
              <DialogTitle className="font-semibold text-base text-white">{capabilityLabel}</DialogTitle>
              <DialogDescription className="text-sm text-slate-400">Requires {TIER_LABELS[requiredTier]} plan</DialogDescription>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            Unlock {capabilityLabel} and all {TIER_LABELS[requiredTier]} features
            for <span className="font-semibold text-white">{tierPrice}</span>.
          </p>
          <div className="flex gap-3">
            <a
              ref={upgradeRef}
              href={billingPortalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center min-h-[2.75rem] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Upgrade to {TIER_LABELS[requiredTier]}
            </a>
            <button
              onClick={onClose}
              className="min-h-[2.75rem] px-4 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              aria-label="Dismiss"
            >
              Not now
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
