import { describe, expect, it, vi } from 'vitest';
import {
  checkTCPA,
  logConsent,
  checkFDCPA,
  recordContact,
  suppressPhone,
  submitDSR,
  getDSRStatus,
  listDSRRequests,
  fulfillDSR,
  eraseDSR,
  CREATE_COMPLIANCE_CONSENTS_TABLE,
  CREATE_COMPLIANCE_CONTACTS_TABLE,
  CREATE_TCPA_SUPPRESSION_TABLE,
  CREATE_DSR_REQUESTS_TABLE,
  CREATE_DSR_ARTIFACTS_TABLE,
  // WB-6
  isWithinCallingHours,
  createConsentService,
  canDispatchCall,
  CREATE_CONSENT_AUDIT_LOG_TABLE,
  type ConsentStatus,
} from './index';
import type { FactoryDb } from '@latimer-woods-tech/neon';

function makeDb(overrides: { rows?: unknown[]; rowCount?: number } = {}): FactoryDb {
  const rows = overrides.rows ?? [];
  const rowCount = overrides.rowCount ?? rows.length;
  return { execute: vi.fn().mockResolvedValue({ rows, rowCount }) } as unknown as FactoryDb;
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------
describe('DDL constants', () => {
  it('CREATE_COMPLIANCE_CONSENTS_TABLE references table name', () => {
    expect(CREATE_COMPLIANCE_CONSENTS_TABLE).toContain('compliance_consents');
  });
  it('CREATE_COMPLIANCE_CONTACTS_TABLE references table name', () => {
    expect(CREATE_COMPLIANCE_CONTACTS_TABLE).toContain('compliance_contacts');
  });
  it('CREATE_TCPA_SUPPRESSION_TABLE references table name', () => {
    expect(CREATE_TCPA_SUPPRESSION_TABLE).toContain('compliance_tcpa_suppression');
  });
});

// ---------------------------------------------------------------------------
// checkTCPA
// ---------------------------------------------------------------------------
describe('checkTCPA', () => {
  it('returns safe:true when phone is not suppressed', async () => {
    const db = makeDb({ rows: [] });
    const result = await checkTCPA({ phone: '+15551234567', db });
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns safe:false with reason when phone is suppressed', async () => {
    const db = makeDb({ rows: [{ phone: '+15551234567', reason: 'opted out' }] });
    const result = await checkTCPA({ phone: '+15551234567', db });
    expect(result.safe).toBe(false);
    expect(result.reason).toBe('opted out');
  });

  it('returns safe:false with default reason when reason is null', async () => {
    const db = makeDb({ rows: [{ phone: '+15551234567', reason: null }] });
    const result = await checkTCPA({ phone: '+15551234567', db });
    expect(result.safe).toBe(false);
    expect(result.reason).toBe('Number on TCPA suppression list');
  });

  it('throws when phone is empty', async () => {
    const db = makeDb();
    await expect(checkTCPA({ phone: '', db })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// logConsent
// ---------------------------------------------------------------------------
describe('logConsent', () => {
  it('resolves on success', async () => {
    const db = makeDb();
    await expect(
      logConsent(db, {
        userId: 'user-1',
        consentType: 'TCPA',
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      }),
    ).resolves.toBeUndefined();
  });

  it('passes null userAgent when omitted', async () => {
    const db = makeDb();
    await expect(
      logConsent(db, { userId: 'user-1', consentType: 'GDPR', ipAddress: '1.2.3.4' }),
    ).resolves.toBeUndefined();
  });

  it('throws when required fields are missing', async () => {
    const db = makeDb();
    await expect(
      logConsent(db, { userId: '', consentType: 'TCPA', ipAddress: '1.2.3.4' }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// checkFDCPA
// ---------------------------------------------------------------------------
describe('checkFDCPA', () => {
  it('allows when there is no prior contact', async () => {
    const db = makeDb({ rows: [] });
    const result = await checkFDCPA(db, { contactId: 'contact-1', callType: 'initial' });
    expect(result.allowed).toBe(true);
  });

  it('allows when last contact was >24 hours ago', async () => {
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
    const db = makeDb({ rows: [{ contacted_at: old }] });
    const result = await checkFDCPA(db, { contactId: 'contact-1', callType: 'follow_up' });
    expect(result.allowed).toBe(true);
  });

  it('denies when last contact was <24 hours ago', async () => {
    const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const db = makeDb({ rows: [{ contacted_at: recent }] });
    const result = await checkFDCPA(db, { contactId: 'contact-1', callType: 'follow_up' });
    expect(result.allowed).toBe(false);
    expect(result.nextAllowedAt).toBeInstanceOf(Date);
    expect(result.reason).toBeDefined();
  });

  it('provides initial contact reason message', async () => {
    const recent = new Date(Date.now() - 1 * 3_600_000).toISOString();
    const db = makeDb({ rows: [{ contacted_at: recent }] });
    const result = await checkFDCPA(db, { contactId: 'contact-1', callType: 'initial' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('24-hour');
  });

  it('throws when contactId is missing', async () => {
    const db = makeDb();
    await expect(checkFDCPA(db, { contactId: '', callType: 'initial' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// recordContact
// ---------------------------------------------------------------------------
describe('recordContact', () => {
  it('resolves on success', async () => {
    const db = makeDb();
    await expect(
      recordContact(db, { contactId: 'contact-1', callType: 'initial' }),
    ).resolves.toBeUndefined();
  });

  it('throws when contactId is missing', async () => {
    const db = makeDb();
    await expect(
      recordContact(db, { contactId: '', callType: 'initial' }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// suppressPhone
// ---------------------------------------------------------------------------
describe('suppressPhone', () => {
  it('resolves on success', async () => {
    const db = makeDb();
    await expect(suppressPhone(db, '+15551234567', 'opted out')).resolves.toBeUndefined();
  });

  it('resolves without reason', async () => {
    const db = makeDb();
    await expect(suppressPhone(db, '+15551234567')).resolves.toBeUndefined();
  });

  it('throws when phone is empty', async () => {
    const db = makeDb();
    await expect(suppressPhone(db, '')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DSR DDL constants
// ---------------------------------------------------------------------------
describe('DSR DDL constants', () => {
  it('CREATE_DSR_REQUESTS_TABLE references table name', () => {
    expect(CREATE_DSR_REQUESTS_TABLE).toContain('compliance_dsr_requests');
  });
  it('CREATE_DSR_ARTIFACTS_TABLE references table name', () => {
    expect(CREATE_DSR_ARTIFACTS_TABLE).toContain('compliance_dsr_artifacts');
  });
});

// ---------------------------------------------------------------------------
// submitDSR
// ---------------------------------------------------------------------------
describe('submitDSR', () => {
  it('returns the generated request ID on success', async () => {
    const db = makeDb({ rows: [{ id: 'dsr-uuid-1' }] });
    const id = await submitDSR(db, { userId: 'user-1', requestType: 'access' });
    expect(id).toBe('dsr-uuid-1');
  });

  it('accepts optional appId and notes', async () => {
    const db = makeDb({ rows: [{ id: 'dsr-uuid-2' }] });
    const id = await submitDSR(db, {
      userId: 'user-1',
      appId: 'humandesign',
      requestType: 'erasure',
      notes: 'Please erase all my data.',
    });
    expect(id).toBe('dsr-uuid-2');
  });

  it('throws ValidationError when userId is empty', async () => {
    const db = makeDb();
    await expect(submitDSR(db, { userId: '', requestType: 'access' })).rejects.toThrow();
  });

  it('throws ValidationError for an invalid requestType', async () => {
    const db = makeDb();
    await expect(
      submitDSR(db, { userId: 'user-1', requestType: 'invalid' as never }),
    ).rejects.toThrow();
  });

  it('throws InternalError when INSERT returns no id', async () => {
    const db = makeDb({ rows: [] });
    await expect(submitDSR(db, { userId: 'user-1', requestType: 'access' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getDSRStatus
// ---------------------------------------------------------------------------
describe('getDSRStatus', () => {
  const dsrRow = {
    id: 'dsr-uuid-1',
    user_id: 'user-1',
    app_id: 'humandesign',
    request_type: 'erasure',
    status: 'pending',
    notes: null,
    submitted_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('returns a DsrRequest record on success', async () => {
    const db = makeDb({ rows: [dsrRow] });
    const result = await getDSRStatus(db, 'dsr-uuid-1');
    expect(result.id).toBe('dsr-uuid-1');
    expect(result.userId).toBe('user-1');
    expect(result.appId).toBe('humandesign');
    expect(result.requestType).toBe('erasure');
    expect(result.status).toBe('pending');
    expect(result.notes).toBeNull();
    expect(result.submittedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('throws NotFoundError when no record exists', async () => {
    const db = makeDb({ rows: [] });
    await expect(getDSRStatus(db, 'dsr-uuid-missing')).rejects.toThrow();
  });

  it('throws ValidationError when requestId is empty', async () => {
    const db = makeDb();
    await expect(getDSRStatus(db, '')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listDSRRequests
// ---------------------------------------------------------------------------
describe('listDSRRequests', () => {
  const dsrRow = {
    id: 'dsr-uuid-1',
    user_id: 'user-1',
    app_id: null,
    request_type: 'access',
    status: 'pending',
    notes: null,
    submitted_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('returns an array of DsrRequest records', async () => {
    const db = makeDb({ rows: [dsrRow] });
    const results = await listDSRRequests(db);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('dsr-uuid-1');
  });

  it('returns an empty array when no records match', async () => {
    const db = makeDb({ rows: [] });
    const results = await listDSRRequests(db, { userId: 'unknown-user' });
    expect(results).toHaveLength(0);
  });

  it('accepts userId, appId, and status filters without throwing', async () => {
    const db = makeDb({ rows: [] });
    await expect(
      listDSRRequests(db, { userId: 'u-1', appId: 'humandesign', status: 'fulfilled' }),
    ).resolves.toEqual([]);
  });

  it('throws ValidationError for an invalid status filter', async () => {
    const db = makeDb();
    await expect(
      listDSRRequests(db, { status: 'unknown' as never }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fulfillDSR
// ---------------------------------------------------------------------------
describe('fulfillDSR', () => {
  it('resolves on success', async () => {
    const db = makeDb();
    await expect(
      fulfillDSR(db, {
        requestId: 'dsr-uuid-1',
        kind: 'export_bundle',
        payload: { url: 'https://r2.example/export.zip' },
      }),
    ).resolves.toBeUndefined();
  });

  it('throws ValidationError when requestId is empty', async () => {
    const db = makeDb();
    await expect(
      fulfillDSR(db, { requestId: '', kind: 'export_bundle', payload: {} }),
    ).rejects.toThrow();
  });

  it('throws ValidationError when kind is empty', async () => {
    const db = makeDb();
    await expect(
      fulfillDSR(db, { requestId: 'dsr-uuid-1', kind: '', payload: {} }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// eraseDSR
// ---------------------------------------------------------------------------
describe('eraseDSR', () => {
  it('resolves on success', async () => {
    const db = makeDb();
    await expect(eraseDSR(db, 'user-1')).resolves.toBeUndefined();
  });

  it('throws ValidationError when userId is empty', async () => {
    const db = makeDb();
    await expect(eraseDSR(db, '')).rejects.toThrow();
  });

  it('calls execute twice — once for consent anonymisation and once to fulfil open erasure DSRs', async () => {
    const db = makeDb();
    await eraseDSR(db, 'user-1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// WB-6a: ConsentService
// ---------------------------------------------------------------------------
describe('CREATE_CONSENT_AUDIT_LOG_TABLE', () => {
  it('contains the consent_audit_log table name', () => {
    expect(CREATE_CONSENT_AUDIT_LOG_TABLE).toContain('consent_audit_log');
  });
  it('creates an index on contact_id + tenant_id', () => {
    expect(CREATE_CONSENT_AUDIT_LOG_TABLE).toContain('consent_audit_log_contact_idx');
  });
});

describe('ConsentService.getConsentStatus', () => {
  it("returns 'unknown' when no audit rows exist", async () => {
    const db = makeDb({ rows: [] });
    const svc = createConsentService();
    const status = await svc.getConsentStatus(db, 'contact-1', 'tenant-1');
    expect(status).toBe('unknown');
  });

  it('returns the most recent status when rows exist', async () => {
    const db = makeDb({ rows: [{ new_status: 'opted_in' }] });
    const svc = createConsentService();
    const status = await svc.getConsentStatus(db, 'contact-1', 'tenant-1');
    expect(status).toBe<ConsentStatus>('opted_in');
  });

  it('returns opted_out when latest row is opted_out', async () => {
    const db = makeDb({ rows: [{ new_status: 'opted_out' }] });
    const svc = createConsentService();
    const status = await svc.getConsentStatus(db, 'contact-1', 'tenant-1');
    expect(status).toBe<ConsentStatus>('opted_out');
  });

  it('returns do_not_contact when latest row is do_not_contact', async () => {
    const db = makeDb({ rows: [{ new_status: 'do_not_contact' }] });
    const svc = createConsentService();
    const status = await svc.getConsentStatus(db, 'contact-1', 'tenant-1');
    expect(status).toBe<ConsentStatus>('do_not_contact');
  });
});

describe('ConsentService.setConsentStatus', () => {
  it('inserts an audit row (calls execute twice: once to read old status, once to insert)', async () => {
    // First call returns empty rows (old status = unknown), second call is the insert.
    const db = makeDb({ rows: [] });
    const svc = createConsentService();
    await svc.setConsentStatus(db, 'contact-1', 'tenant-1', 'opted_in', 'admin', 'signed web form');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it('subsequent getConsentStatus returns new status', async () => {
    // Simulate DB that returns the new status after insert.
    const executeMock = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // getConsentStatus inside set (old status)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // insert
      .mockResolvedValueOnce({ rows: [{ new_status: 'opted_out' }], rowCount: 1 }); // get after set
    const db = { execute: executeMock } as unknown as FactoryDb;
    const svc = createConsentService();
    await svc.setConsentStatus(db, 'contact-1', 'tenant-1', 'opted_out');
    const status = await svc.getConsentStatus(db, 'contact-1', 'tenant-1');
    expect(status).toBe<ConsentStatus>('opted_out');
  });

  it('passes null old_status when no prior row exists', async () => {
    const db = makeDb({ rows: [] });
    const svc = createConsentService();
    await svc.setConsentStatus(db, 'c', 't', 'opted_in');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

describe('ConsentService.canContact', () => {
  it("returns true when status is 'opted_in'", async () => {
    const db = makeDb({ rows: [{ new_status: 'opted_in' }] });
    const svc = createConsentService();
    expect(await svc.canContact(db, 'c', 't')).toBe(true);
  });

  it("returns true when status is 'unknown' (no rows)", async () => {
    const db = makeDb({ rows: [] });
    const svc = createConsentService();
    expect(await svc.canContact(db, 'c', 't')).toBe(true);
  });

  it("returns false when status is 'opted_out'", async () => {
    const db = makeDb({ rows: [{ new_status: 'opted_out' }] });
    const svc = createConsentService();
    expect(await svc.canContact(db, 'c', 't')).toBe(false);
  });

  it("returns false when status is 'do_not_contact'", async () => {
    const db = makeDb({ rows: [{ new_status: 'do_not_contact' }] });
    const svc = createConsentService();
    expect(await svc.canContact(db, 'c', 't')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WB-6b: isWithinCallingHours
// ---------------------------------------------------------------------------
describe('isWithinCallingHours', () => {
  /**
   * Pin a specific wall-clock time for determinism.
   * 2026-01-07 14:00 UTC = 09:00 EST (UTC-5) — within calling hours.
   */
  const IN_HOURS_UTC = new Date('2026-01-07T14:00:00Z').getTime();
  /**
   * 2026-01-07 03:00 UTC = 22:00 EST — outside calling hours.
   */
  const OUT_OF_HOURS_UTC = new Date('2026-01-07T03:00:00Z').getTime();

  it('returns true at 09:00 EST (UTC-5)', () => {
    expect(isWithinCallingHours('America/New_York', IN_HOURS_UTC)).toBe(true);
  });

  it('returns false at 22:00 EST (UTC-5)', () => {
    expect(isWithinCallingHours('America/New_York', OUT_OF_HOURS_UTC)).toBe(false);
  });

  it('returns true at 09:00 CST (UTC-6)', () => {
    // 15:00 UTC = 09:00 CST
    const ts = new Date('2026-01-07T15:00:00Z').getTime();
    expect(isWithinCallingHours('America/Chicago', ts)).toBe(true);
  });

  it('returns false at 21:00 local (hour 21 is exclusive end)', () => {
    // 2026-01-07T02:00Z = 21:00 EST
    const ts = new Date('2026-01-07T02:00:00Z').getTime();
    expect(isWithinCallingHours('America/New_York', ts)).toBe(false);
  });

  it('returns true at exactly 08:00 local (inclusive start)', () => {
    // 2026-01-07T13:00Z = 08:00 EST
    const ts = new Date('2026-01-07T13:00:00Z').getTime();
    expect(isWithinCallingHours('America/New_York', ts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WB-6b: canDispatchCall
// ---------------------------------------------------------------------------
describe('canDispatchCall', () => {
  /**
   * Pinned times for in-hours and out-of-hours checks.
   * We override the isWithinCallingHours dependency via a mock consentService
   * combined with an injected now-time to keep tests deterministic.
   */
  const IN_HOURS_UTC = new Date('2026-01-07T14:00:00Z').getTime(); // 09:00 EST

  function makeConsentDb(status: ConsentStatus): FactoryDb {
    return makeDb({ rows: status === 'unknown' ? [] : [{ new_status: status }] });
  }

  function makeConsentSvc(canContactResult: boolean): Parameters<typeof canDispatchCall>[4] {
    return {
      getConsentStatus: vi.fn().mockResolvedValue(canContactResult ? 'opted_in' : 'opted_out'),
      setConsentStatus: vi.fn().mockResolvedValue(undefined),
      canContact: vi.fn().mockResolvedValue(canContactResult),
    };
  }

  it('allows call: opted_in + in-hours', async () => {
    const db = makeConsentDb('opted_in');
    const svc = makeConsentSvc(true);
    // Pass a stable in-hours timestamp via a wrapper that patches Date.now inside
    vi.spyOn(Date, 'now').mockReturnValue(IN_HOURS_UTC);
    const result = await canDispatchCall(db, 'c', 't', 'America/New_York', svc);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('blocks call: opted_in + out-of-hours', async () => {
    const db = makeConsentDb('opted_in');
    const svc = makeConsentSvc(true);
    // 22:00 EST
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-07T03:00:00Z').getTime());
    const result = await canDispatchCall(db, 'c', 't', 'America/New_York', svc);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('outside_calling_hours');
    vi.restoreAllMocks();
  });

  it('blocks call: opted_out + in-hours', async () => {
    const db = makeConsentDb('opted_out');
    const svc = makeConsentSvc(false);
    vi.spyOn(Date, 'now').mockReturnValue(IN_HOURS_UTC);
    const result = await canDispatchCall(db, 'c', 't', 'America/New_York', svc);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('consent_required');
    vi.restoreAllMocks();
  });

  it('blocks call: opted_out + out-of-hours', async () => {
    const db = makeConsentDb('opted_out');
    const svc = makeConsentSvc(false);
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-07T03:00:00Z').getTime());
    const result = await canDispatchCall(db, 'c', 't', 'America/New_York', svc);
    expect(result.allowed).toBe(false);
    // consent_required is checked first
    expect(result.reason).toBe('consent_required');
    vi.restoreAllMocks();
  });

  it('allows call: unknown consent + in-hours (unknown is permissive)', async () => {
    const db = makeConsentDb('unknown');
    const svc = makeConsentSvc(true); // unknown => canContact true
    vi.spyOn(Date, 'now').mockReturnValue(IN_HOURS_UTC);
    const result = await canDispatchCall(db, 'c', 't', 'America/New_York', svc);
    expect(result.allowed).toBe(true);
    vi.restoreAllMocks();
  });

  it('blocks call: unknown consent + out-of-hours', async () => {
    const db = makeConsentDb('unknown');
    const svc = makeConsentSvc(true); // unknown => canContact true
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-07T03:00:00Z').getTime());
    const result = await canDispatchCall(db, 'c', 't', 'America/New_York', svc);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('outside_calling_hours');
    vi.restoreAllMocks();
  });

  it('blocks call: do_not_contact + in-hours', async () => {
    const db = makeConsentDb('do_not_contact');
    const svc = makeConsentSvc(false);
    vi.spyOn(Date, 'now').mockReturnValue(IN_HOURS_UTC);
    const result = await canDispatchCall(db, 'c', 't', 'America/New_York', svc);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('consent_required');
    vi.restoreAllMocks();
  });

  it('uses America/Chicago timezone check', async () => {
    const db = makeConsentDb('opted_in');
    const svc = makeConsentSvc(true);
    // 15:00 UTC = 09:00 CST — in hours
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-07T15:00:00Z').getTime());
    const result = await canDispatchCall(db, 'c', 't', 'America/Chicago', svc);
    expect(result.allowed).toBe(true);
    vi.restoreAllMocks();
  });
});
