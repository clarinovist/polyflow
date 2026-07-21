import { describe, it, expect } from 'vitest';
import { normalizePhone, phoneVariants, isValidPhone } from '../phone';

describe('phone normalize', () => {
  it('08xxxx stays 08', () => {
    expect(normalizePhone('08123456789')).toBe('08123456789');
  });
  it('62 -> 0', () => {
    expect(normalizePhone('628123456789')).toBe('08123456789');
  });
  it('+62 -> 0', () => {
    expect(normalizePhone('+628123456789')).toBe('08123456789');
  });
  it('8 prefix -> 08', () => {
    expect(normalizePhone('8123456789')).toBe('08123456789');
  });
  it('strips spaces dashes', () => {
    expect(normalizePhone('08 1234-567 89')).toBe('08123456789');
  });
});

describe('phone variants', () => {
  it('generates all forms', () => {
    const v = phoneVariants('08123456789');
    expect(v).toContain('08123456789');
    expect(v).toContain('628123456789');
    expect(v).toContain('+628123456789');
  });
});

describe('isValidPhone', () => {
  it('valid', () => {
    expect(isValidPhone('08123456789')).toBe(true);
    expect(isValidPhone('+628123456789')).toBe(true);
  });
  it('invalid', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});
