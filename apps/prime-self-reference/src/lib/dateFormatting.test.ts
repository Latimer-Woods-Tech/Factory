/**
 * Tests for dateFormatting utilities
 *
 * Covers the `parseToUTC` function, with emphasis on defensive handling of
 * non-string inputs — the root cause of the Sentry issue
 * NODE-CLOUDFLARE-PAGES-1H (birthDate.split is not a function).
 */

import { describe, it, expect } from 'vitest';
import { parseToUTC } from '../lib/dateFormatting';

describe('parseToUTC', () => {
  // ── Happy-path ─────────────────────────────────────────────────────────────

  it('returns midnight UTC when no birthTime is supplied', () => {
    expect(parseToUTC('1990-05-15')).toBe('1990-05-15T00:00:00.000Z');
  });

  it('combines birthDate and birthTime into a UTC ISO string', () => {
    expect(parseToUTC('1990-05-15', '14:30')).toBe('1990-05-15T14:30:00.000Z');
  });

  it('handles midnight explicitly (00:00)', () => {
    expect(parseToUTC('2000-01-01', '00:00')).toBe('2000-01-01T00:00:00.000Z');
  });

  it('handles the last minute of the day (23:59)', () => {
    expect(parseToUTC('2000-01-01', '23:59')).toBe('2000-01-01T23:59:00.000Z');
  });

  it('handles single-digit month and day correctly', () => {
    expect(parseToUTC('1985-01-07')).toBe('1985-01-07T00:00:00.000Z');
  });

  it('handles end-of-year dates', () => {
    expect(parseToUTC('1999-12-31', '23:59')).toBe('1999-12-31T23:59:00.000Z');
  });

  // ── Non-string birthDate — root cause of the Sentry bug ───────────────────

  it('throws TypeError when birthDate is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(null as any)).toThrow(TypeError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(null as any)).toThrow('birthDate must be a string');
  });

  it('throws TypeError when birthDate is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(undefined as any)).toThrow(TypeError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(undefined as any)).toThrow('birthDate must be a string');
  });

  it('throws TypeError when birthDate is a Date object', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(new Date('1990-05-15') as any)).toThrow(TypeError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(new Date('1990-05-15') as any)).toThrow('birthDate must be a string');
  });

  it('throws TypeError when birthDate is a number', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(19900515 as any)).toThrow(TypeError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC(19900515 as any)).toThrow('birthDate must be a string');
  });

  it('throws TypeError when birthDate is an object', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC({ date: '1990-05-15' } as any)).toThrow(TypeError);
  });

  // ── Malformed birthDate strings ────────────────────────────────────────────

  it('throws when birthDate is an empty string', () => {
    expect(() => parseToUTC('')).toThrow('birthDate must not be empty');
  });

  it('throws when birthDate has wrong separator (slash)', () => {
    expect(() => parseToUTC('1990/05/15')).toThrow('invalid birthDate format');
  });

  it('throws when birthDate is missing parts', () => {
    expect(() => parseToUTC('1990-05')).toThrow('invalid birthDate format');
  });

  it('throws when birthDate has non-numeric year', () => {
    expect(() => parseToUTC('YYYY-05-15')).toThrow('non-numeric date parts');
  });

  it('throws when month is out of range', () => {
    expect(() => parseToUTC('1990-13-01')).toThrow('month 13 is out of range');
    expect(() => parseToUTC('1990-00-01')).toThrow('month 0 is out of range');
  });

  it('throws when day is out of range', () => {
    expect(() => parseToUTC('1990-05-32')).toThrow('day 32 is out of range');
    expect(() => parseToUTC('1990-05-00')).toThrow('day 0 is out of range');
  });

  // ── Non-string birthTime ───────────────────────────────────────────────────

  it('throws TypeError when birthTime is a number', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC('1990-05-15', 1430 as any)).toThrow(TypeError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC('1990-05-15', 1430 as any)).toThrow('birthTime must be a string');
  });

  it('throws TypeError when birthTime is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseToUTC('1990-05-15', null as any)).toThrow(TypeError);
  });

  // ── Malformed birthTime strings ────────────────────────────────────────────

  it('throws when birthTime has wrong separator', () => {
    expect(() => parseToUTC('1990-05-15', '14.30')).toThrow('invalid birthTime format');
  });

  it('throws when birthTime is missing parts', () => {
    expect(() => parseToUTC('1990-05-15', '1430')).toThrow('invalid birthTime format');
  });

  it('throws when hours are out of range', () => {
    expect(() => parseToUTC('1990-05-15', '24:00')).toThrow('hours 24 is out of range');
    expect(() => parseToUTC('1990-05-15', '-1:00')).toThrow('hours -1 is out of range');
  });

  it('throws when minutes are out of range', () => {
    expect(() => parseToUTC('1990-05-15', '12:60')).toThrow('minutes 60 is out of range');
    expect(() => parseToUTC('1990-05-15', '12:-1')).toThrow('minutes -1 is out of range');
  });
});
