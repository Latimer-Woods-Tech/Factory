import { describe, expect, it } from 'vitest';
import {
  accountReviewRequiredTemplate,
  magicLinkTemplate,
  passwordResetTemplate,
  payoutCompletedTemplate,
  renewalFailedTemplate,
  subscriptionConfirmedTemplate,
} from './templates.js';

const BRAND = {
  productName: 'TestApp',
  supportEmail: 'support@testapp.com',
  accentColor: '#ff6600',
};

const BRAND_MINIMAL = { productName: 'MinimalApp' };

// ---------------------------------------------------------------------------
// subscriptionConfirmedTemplate
// ---------------------------------------------------------------------------

describe('subscriptionConfirmedTemplate', () => {
  const vars = {
    brand: BRAND,
    userName: 'Alice',
    planName: 'Pro',
    amount: '$29/month',
    nextBillingDate: 'June 26, 2026',
    manageUrl: 'https://app.example.com/manage',
  };

  it('includes product name in subject', () => {
    const { subject } = subscriptionConfirmedTemplate(vars);
    expect(subject).toContain('Pro');
    expect(subject).toContain('confirmed');
  });

  it('includes user name in html', () => {
    const { html } = subscriptionConfirmedTemplate(vars);
    expect(html).toContain('Alice');
  });

  it('includes plan name and amount in html', () => {
    const { html } = subscriptionConfirmedTemplate(vars);
    expect(html).toContain('Pro');
    expect(html).toContain('$29/month');
  });

  it('includes next billing date in html', () => {
    const { html } = subscriptionConfirmedTemplate(vars);
    expect(html).toContain('June 26, 2026');
  });

  it('includes manage URL in html', () => {
    const { html } = subscriptionConfirmedTemplate(vars);
    expect(html).toContain('https://app.example.com/manage');
  });

  it('includes manage URL in text', () => {
    const { text } = subscriptionConfirmedTemplate(vars);
    expect(text).toContain('https://app.example.com/manage');
  });

  it('uses brand accent color', () => {
    const { html } = subscriptionConfirmedTemplate(vars);
    expect(html).toContain('#ff6600');
  });

  it('uses default accent color when not provided', () => {
    const { html } = subscriptionConfirmedTemplate({ ...vars, brand: BRAND_MINIMAL });
    expect(html).toContain('#0070f3');
  });

  it('includes support email in html', () => {
    const { html } = subscriptionConfirmedTemplate(vars);
    expect(html).toContain('support@testapp.com');
  });

  it('embeds logo img tag when logoUrl is provided', () => {
    const { html } = subscriptionConfirmedTemplate({
      ...vars,
      brand: { ...BRAND, logoUrl: 'https://cdn.example.com/logo.png' },
    });
    expect(html).toContain('<img src="https://cdn.example.com/logo.png"');
  });

  it('omits logo img when logoUrl is not provided', () => {
    const { html } = subscriptionConfirmedTemplate({ ...vars, brand: BRAND_MINIMAL });
    expect(html).not.toContain('<img');
  });
});

// ---------------------------------------------------------------------------
// renewalFailedTemplate
// ---------------------------------------------------------------------------

describe('renewalFailedTemplate', () => {
  const vars = {
    brand: BRAND,
    userName: 'Bob',
    planName: 'Starter',
    amount: '$9/month',
    updatePaymentUrl: 'https://app.example.com/billing',
  };

  it('includes action-required language in subject', () => {
    const { subject } = renewalFailedTemplate(vars);
    expect(subject.toLowerCase()).toContain('action required');
  });

  it('includes user name in html', () => {
    const { html } = renewalFailedTemplate(vars);
    expect(html).toContain('Bob');
  });

  it('includes update payment URL in html', () => {
    const { html } = renewalFailedTemplate(vars);
    expect(html).toContain('https://app.example.com/billing');
  });

  it('includes update payment URL in text', () => {
    const { text } = renewalFailedTemplate(vars);
    expect(text).toContain('https://app.example.com/billing');
  });

  it('includes retry date when provided', () => {
    const { html, text } = renewalFailedTemplate({ ...vars, retryDate: 'June 30, 2026' });
    expect(html).toContain('June 30, 2026');
    expect(text).toContain('June 30, 2026');
  });

  it('omits retry date section when not provided', () => {
    const { html } = renewalFailedTemplate(vars);
    expect(html).not.toContain('retry');
  });
});

// ---------------------------------------------------------------------------
// payoutCompletedTemplate
// ---------------------------------------------------------------------------

describe('payoutCompletedTemplate', () => {
  const vars = {
    brand: BRAND,
    userName: 'Carol',
    amount: '$142.50',
    currency: 'USD',
    dashboardUrl: 'https://app.example.com/payouts',
  };

  it('includes amount and currency in subject', () => {
    const { subject } = payoutCompletedTemplate(vars);
    expect(subject).toContain('$142.50');
    expect(subject).toContain('USD');
  });

  it('includes user name in html', () => {
    const { html } = payoutCompletedTemplate(vars);
    expect(html).toContain('Carol');
  });

  it('includes dashboard URL in html', () => {
    const { html } = payoutCompletedTemplate(vars);
    expect(html).toContain('https://app.example.com/payouts');
  });

  it('includes estimated arrival when provided', () => {
    const { html, text } = payoutCompletedTemplate({ ...vars, estimatedArrivalDate: 'June 30, 2026' });
    expect(html).toContain('June 30, 2026');
    expect(text).toContain('June 30, 2026');
  });

  it('omits arrival section when not provided', () => {
    const { html } = payoutCompletedTemplate(vars);
    expect(html).not.toContain('Estimated arrival');
  });
});

// ---------------------------------------------------------------------------
// accountReviewRequiredTemplate
// ---------------------------------------------------------------------------

describe('accountReviewRequiredTemplate', () => {
  const vars = {
    brand: BRAND,
    userName: 'Dave',
    reason: 'unusual activity detected',
    supportUrl: 'https://app.example.com/support',
  };

  it('includes product name in subject', () => {
    const { subject } = accountReviewRequiredTemplate(vars);
    expect(subject).toContain('TestApp');
    expect(subject).toContain('review');
  });

  it('includes user name in html', () => {
    const { html } = accountReviewRequiredTemplate(vars);
    expect(html).toContain('Dave');
  });

  it('includes reason in html', () => {
    const { html } = accountReviewRequiredTemplate(vars);
    expect(html).toContain('unusual activity detected');
  });

  it('includes support URL in html and text', () => {
    const { html, text } = accountReviewRequiredTemplate(vars);
    expect(html).toContain('https://app.example.com/support');
    expect(text).toContain('https://app.example.com/support');
  });
});

// ---------------------------------------------------------------------------
// magicLinkTemplate
// ---------------------------------------------------------------------------

describe('magicLinkTemplate', () => {
  const vars = {
    brand: BRAND,
    magicLinkUrl: 'https://app.example.com/auth/magic?token=abc123',
  };

  it('includes product name in subject', () => {
    const { subject } = magicLinkTemplate(vars);
    expect(subject).toContain('TestApp');
  });

  it('includes magic link URL in html and text', () => {
    const { html, text } = magicLinkTemplate(vars);
    expect(html).toContain('https://app.example.com/auth/magic?token=abc123');
    expect(text).toContain('https://app.example.com/auth/magic?token=abc123');
  });

  it('uses default expiry of 15 minutes', () => {
    const { html, text } = magicLinkTemplate(vars);
    expect(html).toContain('15 minutes');
    expect(text).toContain('15 minutes');
  });

  it('uses custom expiry when provided', () => {
    const { html, text } = magicLinkTemplate({ ...vars, expiresInMinutes: 30 });
    expect(html).toContain('30 minutes');
    expect(text).toContain('30 minutes');
  });

  it('warns not to share the link', () => {
    const { html } = magicLinkTemplate(vars);
    expect(html.toLowerCase()).toContain('do not share');
  });
});

// ---------------------------------------------------------------------------
// passwordResetTemplate
// ---------------------------------------------------------------------------

describe('passwordResetTemplate', () => {
  const vars = {
    brand: BRAND,
    userName: 'Eve',
    resetUrl: 'https://app.example.com/auth/reset?token=xyz',
  };

  it('includes product name in subject', () => {
    const { subject } = passwordResetTemplate(vars);
    expect(subject).toContain('TestApp');
    expect(subject).toContain('password');
  });

  it('includes user name in html', () => {
    const { html } = passwordResetTemplate(vars);
    expect(html).toContain('Eve');
  });

  it('includes reset URL in html and text', () => {
    const { html, text } = passwordResetTemplate(vars);
    expect(html).toContain('https://app.example.com/auth/reset?token=xyz');
    expect(text).toContain('https://app.example.com/auth/reset?token=xyz');
  });

  it('uses default expiry of 1 hour', () => {
    const { html, text } = passwordResetTemplate(vars);
    expect(html).toContain('1 hour');
    expect(text).toContain('1 hour');
  });

  it('pluralizes hours correctly', () => {
    const { html, text } = passwordResetTemplate({ ...vars, expiresInHours: 24 });
    expect(html).toContain('24 hours');
    expect(text).toContain('24 hours');
  });

  it('warns user if they did not request a reset', () => {
    const { html, text } = passwordResetTemplate(vars);
    expect(html.toLowerCase()).toContain('did not request');
    expect(text.toLowerCase()).toContain('did not request');
  });
});
