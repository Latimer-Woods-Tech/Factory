import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const executeMock = vi.fn(() => Promise.resolve([]));
  const transactionMock = vi.fn(
    (fn: (tx: { execute: typeof executeMock }) => Promise<unknown>) => fn({ execute: executeMock }),
  );
  const drizzleClient = { execute: executeMock, transaction: transactionMock, $client: { __postgres: true } };
  return {
    executeMock,
    transactionMock,
    drizzleClient,
    drizzleMock: vi.fn(() => drizzleClient),
    postgresMock: vi.fn(() => ({ __postgres: true })),
    migrateMock: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('postgres', () => ({
  default: mocks.postgresMock,
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: mocks.drizzleMock,
}));

vi.mock('drizzle-orm/postgres-js/migrator', () => ({
  migrate: mocks.migrateMock,
}));

import { createDb, runMigrations, withTenant } from './index';

beforeEach(() => {
  mocks.executeMock.mockClear();
  mocks.transactionMock.mockClear();
  mocks.drizzleMock.mockClear();
  mocks.postgresMock.mockClear();
  mocks.migrateMock.mockClear();
});

describe('neon', () => {
  it('createDb wraps the Hyperdrive connection with postgres.js and drizzle', () => {
    const db = createDb({ connectionString: 'postgres://example' });

    expect(mocks.postgresMock).toHaveBeenCalledWith('postgres://example', { prepare: false });
    expect(mocks.drizzleMock).toHaveBeenCalledTimes(1);
    expect(db.$client).toEqual({ __postgres: true });
  });

  it('createDb throws when connectionString is missing', () => {
    expect(() => createDb({ connectionString: '' })).toThrow(
      'Hyperdrive connectionString is required',
    );
  });

  it('withTenant opens a transaction, issues SET LOCAL, and calls fn', async () => {
    const db = createDb({ connectionString: 'postgres://example' });
    const fn = vi.fn(() => Promise.resolve('result'));

    const result = await withTenant(db, 'tenant-123', fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
    // transaction() must be called to obtain a proper BEGIN/COMMIT block
    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    // SET LOCAL must be the first execute inside the transaction
    expect(mocks.executeMock).toHaveBeenCalledTimes(1);
    // The sql tagged template produces an object with a `queryChunks` array —
    // stringify it to verify the SET LOCAL fragment is present.
    const firstArg = (mocks.executeMock.mock.calls as unknown[][])[0]?.[0];
    expect(JSON.stringify(firstArg)).toContain('SET LOCAL app.tenant_id');
  });

  it('withTenant rejects an empty tenantId', async () => {
    const db = createDb({ connectionString: 'postgres://example' });

    await expect(withTenant(db, '', vi.fn())).rejects.toThrow(
      'tenantId is required for withTenant',
    );
  });

  it('withTenant propagates errors thrown by fn', async () => {
    const db = createDb({ connectionString: 'postgres://example' });
    const failure = new Error('boom');

    await expect(
      withTenant(db, 'tenant-123', () => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });

  it('runMigrations delegates to drizzle migrate', async () => {
    const db = createDb({ connectionString: 'postgres://example' });

    await runMigrations(db, { migrationsFolder: './drizzle' });

    expect(mocks.migrateMock).toHaveBeenCalledWith(db, { migrationsFolder: './drizzle' });
  });
});