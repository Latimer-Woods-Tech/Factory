import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  trackLead,
  trackConversion,
  getCustomerView,
  CREATE_CRM_LEADS_TABLE,
  CREATE_CONTACTS_TABLE,
  CREATE_CAMPAIGNS_TABLE,
  CREATE_CALL_LOGS_TABLE,
  ADD_CAMPAIGNS_SCRIPT_COLUMN,
  ENABLE_OUTREACH_RLS,
  ContactService,
  CampaignService,
  CallLogService,
  type OutreachContact,
  type OutreachCampaign,
  type CallLog,
  type TransitionResult,
  type ScriptGenerationResult,
} from './index';
import type { FactoryDb } from '@latimer-woods-tech/neon';
import type { Analytics } from '@latimer-woods-tech/analytics';
import type { LLMEnv } from '@latimer-woods-tech/llm';

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------
function makeDb(overrides: Partial<{ rows: unknown[]; rowCount: number }> = {}): FactoryDb {
  const rows = overrides.rows ?? [];
  const rowCount = overrides.rowCount ?? rows.length;
  const executeMock = vi.fn().mockResolvedValue({ rows, rowCount });
  // transaction() simulates withTenant: run the callback with a tx that has
  // the same execute mock, so SET LOCAL + the real query both succeed.
  const txDb = { execute: executeMock } as unknown as FactoryDb;
  const transactionMock = vi.fn().mockImplementation((fn: (tx: FactoryDb) => Promise<unknown>) => fn(txDb));
  return {
    execute: executeMock,
    transaction: transactionMock,
  } as unknown as FactoryDb;
}

const BASE_LEAD_ROW = {
  id: 'lead-uuid',
  user_id: 'user-1',
  app_id: 'app-1',
  source: 'organic',
  status: 'lead',
  mrr: 0,
  created_at: '2026-01-01T00:00:00Z',
  converted_at: null,
};

describe('CREATE_CRM_LEADS_TABLE', () => {
  it('contains the table name', () => {
    expect(CREATE_CRM_LEADS_TABLE).toContain('crm_leads');
  });
});

describe('trackLead', () => {
  it('returns a Lead on success', async () => {
    const db = makeDb({ rows: [BASE_LEAD_ROW] });
    const lead = await trackLead(db, { userId: 'user-1', appId: 'app-1', source: 'organic' });
    expect(lead.userId).toBe('user-1');
    expect(lead.appId).toBe('app-1');
    expect(lead.source).toBe('organic');
    expect(lead.status).toBe('lead');
    expect(lead.mrr).toBe(0);
    expect(lead.createdAt).toBeInstanceOf(Date);
    expect(lead.convertedAt).toBeUndefined();
  });

  it('maps convertedAt when non-null', async () => {
    const row = { ...BASE_LEAD_ROW, converted_at: '2026-03-01T00:00:00Z' };
    const db = makeDb({ rows: [row] });
    const lead = await trackLead(db, { userId: 'user-1', appId: 'app-1', source: 'tiktok' });
    expect(lead.convertedAt).toBeInstanceOf(Date);
  });

  it('throws when required fields are missing', async () => {
    const db = makeDb({ rows: [] });
    await expect(trackLead(db, { userId: '', appId: 'app-1', source: 'x' })).rejects.toThrow();
  });

  it('throws when no row is returned', async () => {
    const db = makeDb({ rows: [] });
    await expect(trackLead(db, { userId: 'u', appId: 'a', source: 's' })).rejects.toThrow();
  });
});

describe('trackConversion', () => {
  it('resolves on success', async () => {
    const db = makeDb({ rows: [], rowCount: 1 });
    await expect(
      trackConversion(db, { userId: 'user-1', plan: 'pro', mrr: 2900 }),
    ).resolves.toBeUndefined();
  });

  it('calls analytics.businessEvent when analytics provided', async () => {
    const db = makeDb({ rows: [], rowCount: 1 });
    const businessEvent = vi.fn().mockResolvedValue(undefined);
    const analytics = { businessEvent } as unknown as Analytics;
    await trackConversion(db, { userId: 'user-1', plan: 'pro', mrr: 2900 }, analytics);
    expect(businessEvent).toHaveBeenCalledWith(
      'subscription.converted',
      { plan: 'pro', mrr: 2900 },
      'user-1',
    );
  });

  it('throws on negative mrr', async () => {
    const db = makeDb({ rows: [], rowCount: 1 });
    await expect(
      trackConversion(db, { userId: 'u', plan: 'pro', mrr: -1 }),
    ).rejects.toThrow();
  });

  it('throws when no lead found (rowCount 0)', async () => {
    const db = makeDb({ rows: [], rowCount: 0 });
    await expect(
      trackConversion(db, { userId: 'missing', plan: 'pro', mrr: 0 }),
    ).rejects.toThrow();
  });

  it('throws when userId or plan are missing', async () => {
    const db = makeDb({ rows: [], rowCount: 0 });
    await expect(
      trackConversion(db, { userId: '', plan: 'pro', mrr: 0 }),
    ).rejects.toThrow();
  });
});

describe('getCustomerView', () => {
  it('returns low churnRisk for active lead with recent events', async () => {
    const recentDate = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const leadRow = { ...BASE_LEAD_ROW, status: 'active', mrr: 2900 };
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [leadRow] })                        // lead
        .mockResolvedValueOnce({ rows: [{ plan: 'pro', mrr: 2900, status: 'active' }] }) // subs
        .mockResolvedValueOnce({                                            // events
          rows: [{ event: 'page.view', properties: '{}', occurred_at: recentDate }],
        }),
    } as unknown as FactoryDb;

    const view = await getCustomerView(db, 'user-1');
    expect(view.lead.userId).toBe('user-1');
    expect(view.subscriptions).toHaveLength(1);
    expect(view.events).toHaveLength(1);
    expect(view.churnRisk).toBe('low');
  });

  it('returns high churnRisk for churned lead', async () => {
    const churnedRow = { ...BASE_LEAD_ROW, status: 'churned', mrr: 0 };
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [churnedRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as unknown as FactoryDb;

    const view = await getCustomerView(db, 'user-1');
    expect(view.churnRisk).toBe('high');
  });

  it('returns medium churnRisk for lead with mrr=0 and no events', async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [BASE_LEAD_ROW] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as unknown as FactoryDb;

    const view = await getCustomerView(db, 'user-1');
    expect(view.churnRisk).toBe('medium');
  });

  it('returns medium churnRisk when last event was >30 days ago', async () => {
    const oldDate = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const activeRow = { ...BASE_LEAD_ROW, status: 'active', mrr: 2900 };
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [activeRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ event: 'page.view', properties: '{}', occurred_at: oldDate }],
        }),
    } as unknown as FactoryDb;

    const view = await getCustomerView(db, 'user-1');
    expect(view.churnRisk).toBe('medium');
  });

  it('handles missing optional tables gracefully', async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [BASE_LEAD_ROW] })
        .mockRejectedValueOnce(new Error('relation does not exist'))
        .mockRejectedValueOnce(new Error('relation does not exist')),
    } as unknown as FactoryDb;

    const view = await getCustomerView(db, 'user-1');
    expect(view.subscriptions).toEqual([]);
    expect(view.events).toEqual([]);
  });

  it('throws when userId is empty', async () => {
    const db = makeDb({ rows: [] });
    await expect(getCustomerView(db, '')).rejects.toThrow();
  });

  it('throws when no lead row found', async () => {
    const db = makeDb({ rows: [] });
    await expect(getCustomerView(db, 'user-x')).rejects.toThrow();
  });

  it('parses JSON properties when stored as string', async () => {
    const recentDate = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const activeRow = { ...BASE_LEAD_ROW, status: 'active', mrr: 2900 };
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [activeRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ event: 'page.view', properties: '{"button":"cta"}', occurred_at: recentDate }],
        }),
    } as unknown as FactoryDb;
    const view = await getCustomerView(db, 'user-1');
    expect(view.events[0]?.properties).toEqual({ button: 'cta' });
  });
});

// ---------------------------------------------------------------------------
// WB-2 DDL tests
// ---------------------------------------------------------------------------

describe('DDL constants', () => {
  it('CREATE_CONTACTS_TABLE contains the table name', () => {
    expect(CREATE_CONTACTS_TABLE).toContain('outreach_contacts');
  });

  it('CREATE_CAMPAIGNS_TABLE contains the table name', () => {
    expect(CREATE_CAMPAIGNS_TABLE).toContain('outreach_campaigns');
  });

  it('CREATE_CALL_LOGS_TABLE contains the table name', () => {
    expect(CREATE_CALL_LOGS_TABLE).toContain('call_logs');
  });

  it('ENABLE_OUTREACH_RLS enables RLS on all three outreach tables', () => {
    expect(ENABLE_OUTREACH_RLS).toContain('ENABLE ROW LEVEL SECURITY');
    expect(ENABLE_OUTREACH_RLS).toContain('outreach_contacts');
    expect(ENABLE_OUTREACH_RLS).toContain('outreach_campaigns');
    expect(ENABLE_OUTREACH_RLS).toContain('call_logs');
    expect(ENABLE_OUTREACH_RLS).toContain("current_setting('app.tenant_id'");
  });
});

// ---------------------------------------------------------------------------
// WB-2 fixtures
// ---------------------------------------------------------------------------

const BASE_CONTACT_ROW = {
  id: 'contact-uuid-1',
  tenant_id: 'tenant-1',
  first_name: 'John',
  last_name: 'Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  consent_status: 'opted_in',
  provider_call_id: 'telnyx-12345',
  provider: 'telnyx',
  metadata: JSON.stringify({ custom: 'data' }),
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const BASE_CAMPAIGN_ROW = {
  id: 'campaign-uuid-1',
  tenant_id: 'tenant-1',
  name: 'Q1 Outreach',
  description: 'Spring campaign',
  status: 'draft',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const BASE_CALL_LOG_ROW = {
  id: 'calllog-uuid-1',
  campaign_id: 'campaign-uuid-1',
  contact_id: 'contact-uuid-1',
  provider: 'telnyx',
  provider_call_id: 'call-123456',
  duration_seconds: 120,
  outcome: 'completed',
  recording_url: 'https://example.com/recording.mp3',
  call_started: '2026-01-01T10:00:00Z',
  call_ended: '2026-01-01T10:02:00Z',
};

// Suppress unused type warnings — types are tested via assignment
const _c: OutreachContact | undefined = undefined;
const _p: OutreachCampaign | undefined = undefined;
const _l: CallLog | undefined = undefined;
void _c; void _p; void _l;

// ---------------------------------------------------------------------------
// ContactService tests
// ---------------------------------------------------------------------------

describe('ContactService', () => {
  const service = new ContactService();

  describe('createContact', () => {
    it('creates and returns a contact', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      const contact = await service.createContact(db, 'tenant-1', {
        tenantId: 'tenant-1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        consentStatus: 'opted_in',
        provider: 'telnyx',
        providerCallId: 'telnyx-12345',
        metadata: { custom: 'data' },
      });
      expect(contact.id).toBe('contact-uuid-1');
      expect(contact.tenantId).toBe('tenant-1');
      expect(contact.firstName).toBe('John');
      expect(contact.consentStatus).toBe('opted_in');
      expect(contact.provider).toBe('telnyx');
      expect(contact.metadata).toEqual({ custom: 'data' });
      expect(contact.createdAt).toBeInstanceOf(Date);
    });

    it('throws when required fields are missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.createContact(db, 'tenant-1', {
          tenantId: 'tenant-1',
          firstName: '',
          lastName: 'Doe',
          phone: '+1234567890',
          email: 'john@example.com',
          consentStatus: 'opted_in',
        }),
      ).rejects.toThrow();
    });

    it('throws when no row is returned', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.createContact(db, 'tenant-1', {
          tenantId: 'tenant-1',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
          email: 'john@example.com',
          consentStatus: 'opted_in',
        }),
      ).rejects.toThrow('no row returned');
    });
  });

  describe('getContact', () => {
    it('returns a contact with tenant isolation', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      const contact = await service.getContact(db, 'contact-uuid-1', 'tenant-1');
      expect(contact.id).toBe('contact-uuid-1');
      expect(contact.tenantId).toBe('tenant-1');
    });

    it('throws when contact not found', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.getContact(db, 'missing-id', 'tenant-1')).rejects.toThrow('not found');
    });

    it('enforces tenant isolation', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.getContact(db, 'contact-uuid-1', 'other-tenant')).rejects.toThrow('not found');
    });

    it('throws when id or tenantId missing', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      await expect(service.getContact(db, '', 'tenant-1')).rejects.toThrow();
    });
  });

  describe('listContacts', () => {
    it('lists all contacts for a tenant', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      const contacts = await service.listContacts(db, 'tenant-1');
      expect(contacts).toHaveLength(1);
      expect(contacts[0]?.tenantId).toBe('tenant-1');
    });

    it('filters by consentStatus', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      const contacts = await service.listContacts(db, 'tenant-1', { consentStatus: 'opted_in' });
      expect(contacts).toHaveLength(1);
    });

    it('filters by provider', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      const contacts = await service.listContacts(db, 'tenant-1', { provider: 'telnyx' });
      expect(contacts).toHaveLength(1);
    });

    it('respects limit and offset', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      const contacts = await service.listContacts(db, 'tenant-1', { limit: 10, offset: 5 });
      expect(contacts).toHaveLength(1);
    });

    it('throws when tenantId missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.listContacts(db, '')).rejects.toThrow();
    });
  });

  describe('updateConsentStatus', () => {
    it('updates consent status', async () => {
      const db = makeDb({ rows: [{ ...BASE_CONTACT_ROW, consent_status: 'opted_out' }] });
      const contact = await service.updateConsentStatus(db, 'contact-uuid-1', 'tenant-1', 'opted_out');
      expect(contact.consentStatus).toBe('opted_out');
      expect(contact.updatedAt).toBeInstanceOf(Date);
    });

    it('enforces tenant isolation', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.updateConsentStatus(db, 'contact-uuid-1', 'other-tenant', 'do_not_contact'),
      ).rejects.toThrow('not found');
    });

    it('throws when required fields missing', async () => {
      const db = makeDb({ rows: [BASE_CONTACT_ROW] });
      await expect(service.updateConsentStatus(db, '', 'tenant-1', 'opted_in')).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// CampaignService tests
// ---------------------------------------------------------------------------

describe('CampaignService', () => {
  const service = new CampaignService();

  describe('createCampaign', () => {
    it('creates and returns a campaign', async () => {
      const db = makeDb({ rows: [BASE_CAMPAIGN_ROW] });
      const campaign = await service.createCampaign(db, 'tenant-1', {
        tenantId: 'tenant-1',
        name: 'Q1 Outreach',
        description: 'Spring campaign',
      });
      expect(campaign.id).toBe('campaign-uuid-1');
      expect(campaign.tenantId).toBe('tenant-1');
      expect(campaign.name).toBe('Q1 Outreach');
      expect(campaign.status).toBe('draft');
    });

    it('throws when name missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.createCampaign(db, 'tenant-1', { tenantId: 'tenant-1', name: '' }),
      ).rejects.toThrow();
    });

    it('throws when no row returned', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.createCampaign(db, 'tenant-1', { tenantId: 'tenant-1', name: 'Campaign' }),
      ).rejects.toThrow('no row returned');
    });
  });

  describe('getCampaign', () => {
    it('returns a campaign with tenant isolation', async () => {
      const db = makeDb({ rows: [BASE_CAMPAIGN_ROW] });
      const campaign = await service.getCampaign(db, 'campaign-uuid-1', 'tenant-1');
      expect(campaign.id).toBe('campaign-uuid-1');
    });

    it('throws when campaign not found', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.getCampaign(db, 'missing-id', 'tenant-1')).rejects.toThrow('not found');
    });

    it('enforces tenant isolation', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.getCampaign(db, 'campaign-uuid-1', 'other-tenant')).rejects.toThrow('not found');
    });
  });

  describe('listCampaigns', () => {
    it('lists all campaigns for a tenant', async () => {
      const db = makeDb({ rows: [BASE_CAMPAIGN_ROW] });
      const campaigns = await service.listCampaigns(db, 'tenant-1');
      expect(campaigns).toHaveLength(1);
    });

    it('throws when tenantId missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.listCampaigns(db, '')).rejects.toThrow();
    });
  });

  describe('updateCampaignStatus', () => {
    it('updates campaign status', async () => {
      const db = makeDb({ rows: [{ ...BASE_CAMPAIGN_ROW, status: 'active' }] });
      const campaign = await service.updateCampaignStatus(db, 'campaign-uuid-1', 'tenant-1', 'active');
      expect(campaign.status).toBe('active');
    });

    it('enforces tenant isolation', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.updateCampaignStatus(db, 'campaign-uuid-1', 'other-tenant', 'active'),
      ).rejects.toThrow('not found');
    });

    it('throws when required fields missing', async () => {
      const db = makeDb({ rows: [BASE_CAMPAIGN_ROW] });
      await expect(service.updateCampaignStatus(db, '', 'tenant-1', 'active')).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// CallLogService tests
// ---------------------------------------------------------------------------

describe('CallLogService', () => {
  const service = new CallLogService();

  describe('createCallLog', () => {
    it('creates and returns a call log', async () => {
      const db = makeDb({ rows: [BASE_CALL_LOG_ROW] });
      const callLog = await service.createCallLog(db, 'tenant-1', {
        campaignId: 'campaign-uuid-1',
        contactId: 'contact-uuid-1',
        provider: 'telnyx',
        providerCallId: 'call-123456',
        durationSeconds: 120,
        outcome: 'completed',
        recordingUrl: 'https://example.com/recording.mp3',
        callStarted: new Date('2026-01-01T10:00:00Z'),
        callEnded: new Date('2026-01-01T10:02:00Z'),
      });
      expect(callLog.id).toBe('calllog-uuid-1');
      expect(callLog.provider).toBe('telnyx');
      expect(callLog.durationSeconds).toBe(120);
      expect(callLog.callStarted).toBeInstanceOf(Date);
    });

    it('throws when tenantId missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.createCallLog(db, '', {
          campaignId: 'campaign-uuid-1',
          contactId: 'contact-uuid-1',
          provider: 'telnyx',
          providerCallId: 'call-123456',
          durationSeconds: 120,
          outcome: 'completed',
          callStarted: new Date(),
          callEnded: new Date(),
        }),
      ).rejects.toThrow();
    });

    it('throws when required fields missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.createCallLog(db, 'tenant-1', {
          campaignId: '',
          contactId: 'contact-uuid-1',
          provider: 'telnyx',
          providerCallId: 'call-123456',
          durationSeconds: 120,
          outcome: 'completed',
          callStarted: new Date(),
          callEnded: new Date(),
        }),
      ).rejects.toThrow();
    });

    it('throws when no row returned', async () => {
      const db = makeDb({ rows: [] });
      await expect(
        service.createCallLog(db, 'tenant-1', {
          campaignId: 'campaign-uuid-1',
          contactId: 'contact-uuid-1',
          provider: 'telnyx',
          providerCallId: 'call-123456',
          durationSeconds: 120,
          outcome: 'completed',
          callStarted: new Date(),
          callEnded: new Date(),
        }),
      ).rejects.toThrow('no row returned');
    });
  });

  describe('getCallLog', () => {
    it('returns a call log by id', async () => {
      const db = makeDb({ rows: [BASE_CALL_LOG_ROW] });
      const callLog = await service.getCallLog(db, 'calllog-uuid-1', 'tenant-1');
      expect(callLog.id).toBe('calllog-uuid-1');
    });

    it('throws when call log not found', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.getCallLog(db, 'missing-id', 'tenant-1')).rejects.toThrow('not found');
    });

    it('throws when id or tenantId missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.getCallLog(db, '', 'tenant-1')).rejects.toThrow();
      await expect(service.getCallLog(db, 'calllog-uuid-1', '')).rejects.toThrow();
    });
  });

  describe('listCallLogsByCampaign', () => {
    it('lists call logs with tenant isolation', async () => {
      const db = makeDb({ rows: [BASE_CALL_LOG_ROW] });
      const callLogs = await service.listCallLogsByCampaign(db, 'campaign-uuid-1', 'tenant-1');
      expect(callLogs).toHaveLength(1);
      expect(callLogs[0]?.campaignId).toBe('campaign-uuid-1');
    });

    it('enforces tenant isolation via campaign join', async () => {
      const db = makeDb({ rows: [] });
      const callLogs = await service.listCallLogsByCampaign(db, 'campaign-uuid-1', 'other-tenant');
      expect(callLogs).toHaveLength(0);
    });

    it('throws when campaignId or tenantId missing', async () => {
      const db = makeDb({ rows: [] });
      await expect(service.listCallLogsByCampaign(db, '', 'tenant-1')).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// WB-4: ADD_CAMPAIGNS_SCRIPT_COLUMN DDL
// ---------------------------------------------------------------------------

describe('ADD_CAMPAIGNS_SCRIPT_COLUMN', () => {
  it('contains the correct ALTER TABLE statement', () => {
    expect(ADD_CAMPAIGNS_SCRIPT_COLUMN).toContain('outreach_campaigns');
    expect(ADD_CAMPAIGNS_SCRIPT_COLUMN).toContain('script');
    expect(ADD_CAMPAIGNS_SCRIPT_COLUMN).toContain('IF NOT EXISTS');
  });
});

// ---------------------------------------------------------------------------
// WB-4: CampaignService.transitionCampaignStatus
// ---------------------------------------------------------------------------

// Mock the validation module so tests are deterministic and do not depend on
// the real validateAiOutput heuristics.
vi.mock('@latimer-woods-tech/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@latimer-woods-tech/validation')>();
  return {
    ...actual,
    validateAiOutput: vi.fn(),
  };
});

import { validateAiOutput } from '@latimer-woods-tech/validation';
import type { AiOutputValidationResult } from '@latimer-woods-tech/validation';

// Mock the LLM complete function for generateCampaignScript tests
vi.mock('@latimer-woods-tech/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@latimer-woods-tech/llm')>();
  return {
    ...actual,
    complete: vi.fn(),
  };
});

import { complete } from '@latimer-woods-tech/llm';

/** Build a fake AiOutputValidationResult with controlled issues. */
function makeValidationResult(overrides: Partial<AiOutputValidationResult> = {}): AiOutputValidationResult {
  return {
    passed: true,
    score: 100,
    issues: [],
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Dummy LLMEnv — values are never used since complete() is mocked. */
const DUMMY_LLM_ENV: LLMEnv = {
  AI_GATEWAY_BASE_URL: 'https://ai-gateway.example.com',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  GROQ_API_KEY: 'test-groq-key',
  VERTEX_ACCESS_TOKEN: 'test-vertex-token',
  VERTEX_PROJECT: 'test-project',
  VERTEX_LOCATION: 'us-central1',
};

const BASE_CAMPAIGN_ROW_WITH_SCRIPT = {
  id: 'campaign-uuid-1',
  tenant_id: 'tenant-1',
  name: 'Q1 Outreach',
  description: 'Spring campaign',
  status: 'draft',
  script: 'Welcome to our service. We offer great value and effective solutions to help you achieve your goals.',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const BASE_CAMPAIGN_ROW_NO_SCRIPT = {
  ...BASE_CAMPAIGN_ROW_WITH_SCRIPT,
  script: null,
};

const BASE_CAMPAIGN_ROW_ACTIVE = {
  ...BASE_CAMPAIGN_ROW_WITH_SCRIPT,
  status: 'active',
};

describe('CampaignService.transitionCampaignStatus', () => {
  const service = new CampaignService();
  const mockedValidateAiOutput = vi.mocked(validateAiOutput);

  beforeEach(() => {
    mockedValidateAiOutput.mockReset();
  });

  it('allows transition when campaign has no script (no validation needed)', async () => {
    // getCampaign returns draft with no script; updateCampaignStatus returns active
    const db = makeDb({ rows: [BASE_CAMPAIGN_ROW_NO_SCRIPT, { ...BASE_CAMPAIGN_ROW_NO_SCRIPT, status: 'active' }] });

    const result: TransitionResult = await service.transitionCampaignStatus(
      db,
      'campaign-uuid-1',
      'tenant-1',
      'active',
    );

    expect(result.success).toBe(true);
    expect(result.validationErrors).toBeUndefined();
    // validateAiOutput must NOT have been called — no script to validate
    expect(mockedValidateAiOutput).not.toHaveBeenCalled();
  });

  it('allows draft→active transition when script passes all validations', async () => {
    const db = makeDb({
      rows: [
        BASE_CAMPAIGN_ROW_WITH_SCRIPT,
        { ...BASE_CAMPAIGN_ROW_WITH_SCRIPT, status: 'active' },
      ],
    });
    mockedValidateAiOutput.mockReturnValue(makeValidationResult({ passed: true, score: 100, issues: [] }));

    const result: TransitionResult = await service.transitionCampaignStatus(
      db,
      'campaign-uuid-1',
      'tenant-1',
      'active',
      'default',
    );

    expect(result.success).toBe(true);
    expect(result.validationErrors).toBeUndefined();
    expect(mockedValidateAiOutput).toHaveBeenCalledOnce();
  });

  it('blocks draft→active when major violations are found', async () => {
    const db = makeDb({ rows: [BASE_CAMPAIGN_ROW_WITH_SCRIPT] });
    mockedValidateAiOutput.mockReturnValue(
      makeValidationResult({
        passed: false,
        score: 55,
        issues: [
          {
            rule: 'phrase.forbidden',
            severity: 'major',
            message: 'Output contains forbidden phrase: hustle.',
            evidence: 'hustle',
          },
        ],
      }),
    );

    const result: TransitionResult = await service.transitionCampaignStatus(
      db,
      'campaign-uuid-1',
      'tenant-1',
      'active',
      'cypher_healing',
    );

    expect(result.success).toBe(false);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors?.[0]?.rule).toBe('phrase.forbidden');
    expect(result.validationErrors?.[0]?.severity).toBe('major');
  });

  it('blocks draft→active when critical violations are found', async () => {
    const db = makeDb({ rows: [BASE_CAMPAIGN_ROW_WITH_SCRIPT] });
    mockedValidateAiOutput.mockReturnValue(
      makeValidationResult({
        passed: false,
        score: 0,
        issues: [
          {
            rule: 'prompt.leak',
            severity: 'critical',
            message: 'Output appears to leak internal prompt text.',
          },
        ],
      }),
    );

    const result: TransitionResult = await service.transitionCampaignStatus(
      db,
      'campaign-uuid-1',
      'tenant-1',
      'active',
    );

    expect(result.success).toBe(false);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors?.[0]?.severity).toBe('critical');
  });

  it('allows draft→active with only minor violations (logs warning but does not block)', async () => {
    const db = makeDb({
      rows: [
        BASE_CAMPAIGN_ROW_WITH_SCRIPT,
        { ...BASE_CAMPAIGN_ROW_WITH_SCRIPT, status: 'active' },
      ],
    });
    mockedValidateAiOutput.mockReturnValue(
      makeValidationResult({
        passed: true,
        score: 95,
        issues: [
          {
            rule: 'brand.term_missing',
            severity: 'minor',
            message: 'Output is missing preferred brand term: healing.',
          },
        ],
      }),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result: TransitionResult = await service.transitionCampaignStatus(
      db,
      'campaign-uuid-1',
      'tenant-1',
      'active',
      'cypher_healing',
    );

    expect(result.success).toBe(true);
    expect(result.validationErrors).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });

  it('skips validation entirely for non-draft→active transitions', async () => {
    const db = makeDb({
      rows: [
        BASE_CAMPAIGN_ROW_ACTIVE,
        { ...BASE_CAMPAIGN_ROW_ACTIVE, status: 'paused' },
      ],
    });

    const result: TransitionResult = await service.transitionCampaignStatus(
      db,
      'campaign-uuid-1',
      'tenant-1',
      'paused',
    );

    expect(result.success).toBe(true);
    expect(mockedValidateAiOutput).not.toHaveBeenCalled();
  });

  it('throws when required params are missing', async () => {
    const db = makeDb({ rows: [] });
    await expect(
      service.transitionCampaignStatus(db, '', 'tenant-1', 'active'),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// WB-4: CampaignService.generateCampaignScript
// ---------------------------------------------------------------------------

describe('CampaignService.generateCampaignScript', () => {
  const service = new CampaignService();
  const mockedValidateAiOutput = vi.mocked(validateAiOutput);
  const mockedComplete = vi.mocked(complete);

  beforeEach(() => {
    mockedValidateAiOutput.mockReset();
    mockedComplete.mockReset();
  });

  it('generates, validates, and persists a script on success', async () => {
    const generatedText =
      'Our solution delivers effective results and simple value for every customer who joins.';
    mockedComplete.mockResolvedValue({ data: { content: generatedText } } as never);
    mockedValidateAiOutput.mockReturnValue(
      makeValidationResult({ passed: true, score: 100, issues: [] }),
    );

    // First execute: getCampaign SELECT; second: the UPDATE (handled by makeDb's single mock)
    const db = makeDb({ rows: [BASE_CAMPAIGN_ROW_NO_SCRIPT], rowCount: 1 });

    const result: ScriptGenerationResult = await service.generateCampaignScript(
      db,
      'campaign-uuid-1',
      'tenant-1',
      DUMMY_LLM_ENV,
      'default',
    );

    expect(result.success).toBe(true);
    expect(result.script).toBe(generatedText);
    expect(result.validationErrors).toBeUndefined();
    expect(mockedComplete).toHaveBeenCalledOnce();
    expect(mockedValidateAiOutput).toHaveBeenCalledOnce();
  });

  it('returns failure with errors when generated script has major violations', async () => {
    const badScript = 'hustle harder, grind more, quick fix guaranteed profit here.';
    mockedComplete.mockResolvedValue({ data: { content: badScript } } as never);
    mockedValidateAiOutput.mockReturnValue(
      makeValidationResult({
        passed: false,
        score: 40,
        issues: [
          { rule: 'phrase.forbidden', severity: 'major', message: 'Contains forbidden phrase: hustle.' },
          { rule: 'unsafe.advice', severity: 'critical', message: 'Unsafe advice language.' },
        ],
      }),
    );

    const db = makeDb({ rows: [BASE_CAMPAIGN_ROW_NO_SCRIPT] });

    const result: ScriptGenerationResult = await service.generateCampaignScript(
      db,
      'campaign-uuid-1',
      'tenant-1',
      DUMMY_LLM_ENV,
      'cypher_healing',
    );

    expect(result.success).toBe(false);
    expect(result.script).toBeUndefined();
    expect(result.validationErrors).toHaveLength(2);
  });

  it('throws when LLM returns no data', async () => {
    mockedComplete.mockResolvedValue({ data: null, error: { code: 'INTERNAL_ERROR', message: 'oops', statusCode: 500, retryable: false } } as never);

    const db = makeDb({ rows: [BASE_CAMPAIGN_ROW_NO_SCRIPT] });

    await expect(
      service.generateCampaignScript(db, 'campaign-uuid-1', 'tenant-1', DUMMY_LLM_ENV),
    ).rejects.toThrow('LLM returned no data');
  });

  it('throws when required params are missing', async () => {
    const db = makeDb({ rows: [] });
    await expect(
      service.generateCampaignScript(db, '', 'tenant-1', DUMMY_LLM_ENV),
    ).rejects.toThrow();
  });
});
