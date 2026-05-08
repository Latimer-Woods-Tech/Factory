/**
 * ConfirmDialog — Safeguard #2 (Action Scope Confirmation).
 *
 * Tier 1: simple OK/Cancel.
 * Tier 2+: requires the user to type the action name verbatim before OK enables.
 * Tier 4: adds a 30-second cooldown timer to OK.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ConfirmationTier, ReversibilityTier } from '@latimer-woods-tech/studio-core';

const REVERSIBILITY_LABEL: Record<ReversibilityTier, { icon: string; text: string; tone: string }> = {
  trivial:           { icon: '🟢', text: 'Trivial / undo-able',         tone: 'text-emerald-400' },
  reversible:        { icon: '🟡', text: 'Reversible (git revert)',     tone: 'text-amber-400'   },
  'manual-rollback': { icon: '🟠', text: 'Manual rollback required',    tone: 'text-orange-400'  },
  irreversible:      { icon: '🔴', text: 'IRREVERSIBLE — data/external side-effect', tone: 'text-red-400' },
};

export interface ConfirmDialogProps {
  open: boolean;
  action: string;
  description: string;
  reversibility: ReversibilityTier;
  tier: ConfirmationTier;
  /** Token the API expects in X-Confirm-Token (tier ≥ 2). */
  confirmToken?: string;
  onConfirm: (opts: { confirmToken?: string }) => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, action, description, reversibility, tier, confirmToken, onConfirm, onCancel } = props;
  const [typed, setTyped] = useState('');
  const [cooldown, setCooldown] = useState(tier === 4 ? 30 : 0);

  useEffect(() => {
    if (!open) { setTyped(''); setCooldown(tier === 4 ? 30 : 0); }
  }, [open, tier]);

  useEffect(() => {
    if (!open || cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [open, cooldown]);

  const meta = REVERSIBILITY_LABEL[reversibility];

  const canConfirm = useMemo(() => {
    if (cooldown > 0) return false;
    if (tier <= 1) return true;
    return typed.trim() === action;
  }, [tier, typed, action, cooldown]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-lg rounded-lg bg-slate-900 border border-slate-700 p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-lg font-semibold text-white">
          Confirm: {action}
        </h2>

        <p className="mt-2 text-sm text-slate-300">{description}</p>

        <div className={`mt-4 flex items-center gap-2 text-sm ${meta.tone}`}>
          <span aria-hidden>{meta.icon}</span>
          <span>{meta.text}</span>
        </div>

        {tier >= 2 && (
          <div className="mt-4">
            <label htmlFor="confirm-input" className="block text-xs uppercase tracking-wide text-slate-400">
              Type <code className="bg-slate-800 px-1 rounded">{action}</code> to confirm
            </label>
            <input
              id="confirm-input"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder={action}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {tier === 3 && (
          <p className="mt-3 text-xs text-amber-300">
            ⚠ Two-person approval: a second admin must approve this action within 10 minutes.
          </p>
        )}

        {cooldown > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            Cooldown: {cooldown}s remaining…
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => onConfirm({ confirmToken })}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-amber-500"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
