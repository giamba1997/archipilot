import { describe, it, expect } from 'vitest';
import { parseDateFR, formatDateFR, daysUntil, relativeDate } from '../dates';

describe('parseDateFR', () => {
  it('parses valid dd/mm/yyyy', () => {
    const d = parseDateFR('15/03/2026');
    expect(d.getDate()).toBe(15);
    expect(d.getMonth()).toBe(2);
    expect(d.getFullYear()).toBe(2026);
  });

  it('returns null for empty', () => {
    expect(parseDateFR('')).toBeNull();
    expect(parseDateFR(null)).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(parseDateFR('2026-03-15')).toBeNull();
    expect(parseDateFR('abc')).toBeNull();
  });
});

describe('formatDateFR', () => {
  it('formats Date to dd/mm/yyyy', () => {
    expect(formatDateFR(new Date(2026, 2, 15))).toBe('15/03/2026');
  });

  it('pads single digits', () => {
    expect(formatDateFR(new Date(2026, 0, 5))).toBe('05/01/2026');
  });
});

describe('relativeDate', () => {
  it('returns empty for falsy', () => {
    expect(relativeDate('')).toBe('');
    expect(relativeDate(null)).toBe('');
  });

  it('returns original for invalid format', () => {
    expect(relativeDate('abc')).toBe('abc');
  });
});
