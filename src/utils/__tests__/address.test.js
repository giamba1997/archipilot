import { describe, it, expect } from 'vitest';
import { formatAddress, parseAddress } from '../address';

describe('formatAddress', () => {
  it('formats structured address', () => {
    const result = formatAddress({ street: 'Rue de la Loi', number: '16', postalCode: '1000', city: 'Bruxelles', country: 'Belgique' });
    expect(result).toBe('Rue de la Loi 16, 1000 Bruxelles');
  });

  it('omits country for Belgique', () => {
    const result = formatAddress({ street: 'Main St', number: '1', city: 'Gent', country: 'Belgique' });
    expect(result).not.toContain('Belgique');
  });

  it('includes country if not Belgique', () => {
    const result = formatAddress({ street: 'Rue X', number: '1', city: 'Paris', country: 'France' });
    expect(result).toContain('France');
  });

  it('falls back to legacy address', () => {
    expect(formatAddress({ address: '123 Main St' })).toBe('123 Main St');
  });

  it('returns empty for no data', () => {
    expect(formatAddress({})).toBe('');
  });
});

describe('parseAddress', () => {
  it('returns defaults for empty', () => {
    const result = parseAddress('');
    expect(result.country).toBe('Belgique');
    expect(result.street).toBe('');
  });

  it('parses "Street Number, PostalCode City"', () => {
    const result = parseAddress('Rue de la Loi 16, 1000 Bruxelles');
    expect(result.street).toBe('Rue de la Loi');
    expect(result.number).toBe('16');
    expect(result.postalCode).toBe('1000');
    expect(result.city).toBe('Bruxelles');
  });
});
