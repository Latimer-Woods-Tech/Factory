/**
 * Typed transactional email templates for Factory apps.
 *
 * Each template function returns `{ subject, html, text }` ready to pass
 * directly to `EmailClient.sendTransactional()`. Apps customize appearance
 * via the `brand` object; all other fields are content-specific.
 *
 * Templates included:
 *   - subscriptionConfirmed   — payment succeeded, subscription is active
 *   - renewalFailed           — payment failed, action required
 *   - payoutCompleted         — creator payout initiated
 *   - accountReviewRequired   — account flagged for human review
 *   - magicLink               — passwordless sign-in link
 *   - passwordReset           — password reset link
 */

/** Shared branding applied to all templates. */
export interface BrandVars {
  /** Product display name shown in subject lines and headings. */
  productName: string;
  /** Optional support email shown in footers. */
  supportEmail?: string;
  /** Optional logo URL embedded in the HTML header. */
  logoUrl?: string;
  /** Accent hex color for CTA buttons; defaults to `#0070f3`. */
  accentColor?: string;
}

/** Result returned by every template function. */
export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

/** Template variables for the subscription confirmation email. */
export interface SubscriptionConfirmedVars {
  brand: BrandVars;
  userName: string;
  planName: string;
  /** Human-readable amount, e.g. `'$29/month'`. */
  amount: string;
  /** Formatted next billing date, e.g. `'June 26, 2026'`. */
  nextBillingDate: string;
  /** URL to the customer's subscription management page. */
  manageUrl: string;
}

/** Template variables for the renewal failure notification email. */
export interface RenewalFailedVars {
  brand: BrandVars;
  userName: string;
  planName: string;
  /** Human-readable amount that failed. */
  amount: string;
  /** URL to update payment method. */
  updatePaymentUrl: string;
  /** Formatted date of the next retry attempt, if known. */
  retryDate?: string;
}

/** Template variables for the payout completed notification email. */
export interface PayoutCompletedVars {
  brand: BrandVars;
  userName: string;
  /** Human-readable payout amount, e.g. `'$142.50'`. */
  amount: string;
  /** Currency code shown alongside amount, e.g. `'USD'`. */
  currency: string;
  /** URL to the payout dashboard or transaction detail page. */
  dashboardUrl: string;
  /** Estimated arrival date, if known. */
  estimatedArrivalDate?: string;
}

/** Template variables for the account-under-review notification email. */
export interface AccountReviewRequiredVars {
  brand: BrandVars;
  userName: string;
  /** Short reason shown to the user, e.g. `'unusual activity detected'`. */
  reason: string;
  /** URL to the support or appeal page. */
  supportUrl: string;
}

/** Template variables for the magic-link sign-in email. */
export interface MagicLinkVars {
  brand: BrandVars;
  /** One-time sign-in URL. */
  magicLinkUrl: string;
  /** Minutes until the link expires; defaults to `15`. */
  expiresInMinutes?: number;
}

/** Template variables for the password reset email. */
export interface PasswordResetVars {
  brand: BrandVars;
  userName: string;
  /** Password reset URL. */
  resetUrl: string;
  /** Hours until the link expires; defaults to `1`. */
  expiresInHours?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function wrap(brand: BrandVars, title: string, body: string): string {
  const color = brand.accentColor ?? '#0070f3';
  const logo = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.productName}" style="max-height:40px;margin-bottom:16px;" /><br />`
    : '';
  const support = brand.supportEmail
    ? `<p style="margin:0;color:#888;font-size:13px;">Questions? <a href="mailto:${brand.supportEmail}" style="color:#888;">${brand.supportEmail}</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:8px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
<tr><td style="text-align:center;padding-bottom:24px;">${logo}<span style="font-size:20px;font-weight:700;color:#111;">${brand.productName}</span></td></tr>
<tr><td style="color:#333;font-size:15px;line-height:1.6;">${body}</td></tr>
<tr><td style="padding-top:32px;border-top:1px solid #eee;margin-top:32px;text-align:center;">${support}</td></tr>
</table>
</td></tr>
</table>
<!-- accent-color:${color} -->
</body></html>`;
}

function btn(href: string, label: string, color: string): string {
  return `<a href="${href}" style="display:inline-block;margin:24px 0;padding:12px 28px;background:${color};color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">${label}</a>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Confirms that a subscription payment succeeded and the plan is now active.
 */
export function subscriptionConfirmedTemplate(vars: SubscriptionConfirmedVars): EmailTemplateResult {
  const { brand, userName, planName, amount, nextBillingDate, manageUrl } = vars;
  const color = brand.accentColor ?? '#0070f3';
  const subject = `Your ${planName} subscription is confirmed`;
  const html = wrap(
    brand,
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111;">You're all set, ${userName}!</h2>
<p>Your <strong>${planName}</strong> subscription is active. You've been charged <strong>${amount}</strong>.</p>
<p>Your next billing date is <strong>${nextBillingDate}</strong>.</p>
${btn(manageUrl, 'Manage Subscription', color)}
<p style="color:#666;font-size:13px;">You can update or cancel your subscription at any time from your account settings.</p>`,
  );
  const text = `Your ${planName} subscription is confirmed\n\nHi ${userName},\n\nYour ${planName} subscription is active. You were charged ${amount}.\n\nNext billing date: ${nextBillingDate}\n\nManage your subscription: ${manageUrl}`;
  return { subject, html, text };
}

/**
 * Notifies the user that a subscription renewal payment failed.
 */
export function renewalFailedTemplate(vars: RenewalFailedVars): EmailTemplateResult {
  const { brand, userName, planName, amount, updatePaymentUrl, retryDate } = vars;
  const color = brand.accentColor ?? '#0070f3';
  const subject = `Action required: payment failed for your ${planName} subscription`;
  const retry = retryDate ? `<p>We will retry the charge on <strong>${retryDate}</strong>.</p>` : '';
  const html = wrap(
    brand,
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#c0392b;">Payment unsuccessful</h2>
<p>Hi ${userName}, we were unable to process your payment of <strong>${amount}</strong> for your <strong>${planName}</strong> subscription.</p>
${retry}
<p>Please update your payment method to avoid service interruption.</p>
${btn(updatePaymentUrl, 'Update Payment Method', color)}
<p style="color:#666;font-size:13px;">If you believe this is an error, please contact us.</p>`,
  );
  const retryLine = retryDate ? `\nWe will retry on: ${retryDate}` : '';
  const text = `Action required: payment failed\n\nHi ${userName},\n\nWe could not process your payment of ${amount} for ${planName}.${retryLine}\n\nUpdate your payment method: ${updatePaymentUrl}`;
  return { subject, html, text };
}

/**
 * Confirms that a creator payout has been initiated.
 */
export function payoutCompletedTemplate(vars: PayoutCompletedVars): EmailTemplateResult {
  const { brand, userName, amount, currency, dashboardUrl, estimatedArrivalDate } = vars;
  const color = brand.accentColor ?? '#0070f3';
  const subject = `Your payout of ${amount} ${currency} is on its way`;
  const arrival = estimatedArrivalDate
    ? `<p>Estimated arrival: <strong>${estimatedArrivalDate}</strong>.</p>`
    : '';
  const html = wrap(
    brand,
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111;">Payout initiated</h2>
<p>Hi ${userName}, your payout of <strong>${amount} ${currency}</strong> has been initiated.</p>
${arrival}
${btn(dashboardUrl, 'View Payout Details', color)}
<p style="color:#666;font-size:13px;">Payouts typically arrive within 2–5 business days depending on your bank.</p>`,
  );
  const arrivalLine = estimatedArrivalDate ? `\nEstimated arrival: ${estimatedArrivalDate}` : '';
  const text = `Payout initiated\n\nHi ${userName},\n\nYour payout of ${amount} ${currency} has been initiated.${arrivalLine}\n\nView details: ${dashboardUrl}`;
  return { subject, html, text };
}

/**
 * Notifies the user that their account has been flagged for review.
 */
export function accountReviewRequiredTemplate(vars: AccountReviewRequiredVars): EmailTemplateResult {
  const { brand, userName, reason, supportUrl } = vars;
  const color = brand.accentColor ?? '#0070f3';
  const subject = `Important: your ${brand.productName} account requires review`;
  const html = wrap(
    brand,
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#c0392b;">Account review required</h2>
<p>Hi ${userName}, we've flagged your account for review due to <strong>${reason}</strong>.</p>
<p>Your access may be limited until the review is complete. Our team will be in touch shortly.</p>
${btn(supportUrl, 'Contact Support', color)}
<p style="color:#666;font-size:13px;">If you believe this is a mistake, please reach out so we can resolve it quickly.</p>`,
  );
  const text = `Account review required\n\nHi ${userName},\n\nYour account has been flagged for review due to ${reason}. Your access may be limited during this time.\n\nContact support: ${supportUrl}`;
  return { subject, html, text };
}

/**
 * Sends a passwordless magic-link sign-in email.
 */
export function magicLinkTemplate(vars: MagicLinkVars): EmailTemplateResult {
  const { brand, magicLinkUrl, expiresInMinutes = 15 } = vars;
  const color = brand.accentColor ?? '#0070f3';
  const subject = `Your sign-in link for ${brand.productName}`;
  const html = wrap(
    brand,
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111;">Sign in to ${brand.productName}</h2>
<p>Click the button below to sign in. This link expires in <strong>${String(expiresInMinutes)} minutes</strong>.</p>
${btn(magicLinkUrl, 'Sign In', color)}
<p style="color:#666;font-size:13px;">If you did not request this link, you can safely ignore this email. Do not share this link with anyone.</p>`,
  );
  const text = `Sign in to ${brand.productName}\n\nUse the link below to sign in. It expires in ${String(expiresInMinutes)} minutes.\n\n${magicLinkUrl}\n\nIf you did not request this, ignore this email.`;
  return { subject, html, text };
}

/**
 * Sends a password-reset link email.
 */
export function passwordResetTemplate(vars: PasswordResetVars): EmailTemplateResult {
  const { brand, userName, resetUrl, expiresInHours = 1 } = vars;
  const color = brand.accentColor ?? '#0070f3';
  const subject = `Reset your ${brand.productName} password`;
  const html = wrap(
    brand,
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111;">Password reset requested</h2>
<p>Hi ${userName}, someone requested a password reset for your account. Click below to choose a new password.</p>
<p>This link expires in <strong>${String(expiresInHours)} hour${expiresInHours === 1 ? '' : 's'}</strong>.</p>
${btn(resetUrl, 'Reset Password', color)}
<p style="color:#666;font-size:13px;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>`,
  );
  const text = `Reset your password\n\nHi ${userName},\n\nClick the link below to reset your password. It expires in ${String(expiresInHours)} hour${expiresInHours === 1 ? '' : 's'}.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  return { subject, html, text };
}
