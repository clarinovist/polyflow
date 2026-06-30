import { describe, expect, it } from 'vitest';
import { calculatePpn, extractDppFromInclude, calculateTaxFromDpp } from '../ppn';

describe('calculatePpn', () => {
  describe('EXCLUDE mode (B2B)', () => {
    it('calculates PPN correctly for round numbers', () => {
      const result = calculatePpn(1000000, 11, 'EXCLUDE');
      expect(result.dpp).toBe(1000000);
      expect(result.taxAmount).toBe(110000);
      expect(result.total).toBe(1110000);
    });

    it('calculates PPN correctly for decimal numbers', () => {
      const result = calculatePpn(1000000.50, 11, 'EXCLUDE');
      expect(result.dpp).toBe(1000000.50);
      expect(result.taxAmount).toBe(110000.06); // 1000000.50 * 0.11 = 110000.055, rounded to 110000.06
      expect(result.total).toBe(1110000.56);
    });

    it('handles zero subtotal', () => {
      const result = calculatePpn(0, 11, 'EXCLUDE');
      expect(result.dpp).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(0);
    });

    it('handles zero tax percent', () => {
      const result = calculatePpn(1000000, 0, 'EXCLUDE');
      expect(result.dpp).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('INCLUDE mode (B2C)', () => {
    it('calculates PPN correctly for round numbers', () => {
      const result = calculatePpn(1110000, 11, 'INCLUDE');
      expect(result.dpp).toBe(1000000);
      expect(result.taxAmount).toBe(110000);
      expect(result.total).toBe(1110000);
    });

    it('calculates PPN correctly for decimal numbers', () => {
      // 1110000.32 / 1.11 = 1000000.288... → 1000000.29
      const result = calculatePpn(1110000.32, 11, 'INCLUDE');
      expect(result.dpp).toBe(1000000.29);
      expect(result.taxAmount).toBe(110000.03);
      expect(result.total).toBe(1110000.32);
    });

    it('handles zero subtotal', () => {
      const result = calculatePpn(0, 11, 'INCLUDE');
      expect(result.dpp).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('default mode', () => {
    it('defaults to EXCLUDE mode', () => {
      const result = calculatePpn(1000000, 11);
      expect(result.dpp).toBe(1000000);
      expect(result.taxAmount).toBe(110000);
      expect(result.total).toBe(1110000);
    });
  });
});

describe('extractDppFromInclude', () => {
  it('extracts DPP from include price', () => {
    expect(extractDppFromInclude(1110000, 11)).toBe(1000000);
    expect(extractDppFromInclude(111000, 11)).toBe(100000);
  });

  it('handles decimal prices', () => {
    // 1110000.32 / 1.11 = 1000000.288... → 1000000.29
    expect(extractDppFromInclude(1110000.32, 11)).toBe(1000000.29);
  });

  it('uses default tax percent', () => {
    expect(extractDppFromInclude(1110000)).toBe(1000000);
  });
});

describe('calculateTaxFromDpp', () => {
  it('calculates tax from DPP', () => {
    expect(calculateTaxFromDpp(1000000, 11)).toBe(110000);
    expect(calculateTaxFromDpp(100000, 11)).toBe(11000);
  });

  it('handles decimal DPP', () => {
    expect(calculateTaxFromDpp(1000000.50, 11)).toBe(110000.06);
  });

  it('uses default tax percent', () => {
    expect(calculateTaxFromDpp(1000000)).toBe(110000);
  });
});
