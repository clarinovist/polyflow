import { describe, it, expect } from 'vitest';
import {
  normalizePaymentMethodFields,
  getPaymentMethodLabel,
  deriveDestinationBank,
} from '../payment-methods';
import { parsePaymentBanksJson } from '@/services/settings/app-settings-service';

describe('payment-methods', () => {
  describe('normalizePaymentMethodFields', () => {
    it('normalizes Transfer BCA with destination bank', () => {
      expect(
        normalizePaymentMethodFields({ method: 'Transfer BCA' }),
      ).toEqual({
        method: 'Transfer BCA',
        referenceNumber: null,
        destinationBank: 'BCA',
      });
    });

    it('normalizes Transfer Mandiri', () => {
      expect(
        normalizePaymentMethodFields({ method: 'Transfer Mandiri' }),
      ).toEqual({
        method: 'Transfer Mandiri',
        referenceNumber: null,
        destinationBank: 'MANDIRI',
      });
    });

    it('requires check number and clearing bank for Check', () => {
      expect(() =>
        normalizePaymentMethodFields({ method: 'Check' }),
      ).toThrow(/Nomor Cek/);

      expect(() =>
        normalizePaymentMethodFields({
          method: 'Check',
          referenceNumber: 'CG-1',
        }),
      ).toThrow(/clearing/);

      expect(
        normalizePaymentMethodFields({
          method: 'Check',
          referenceNumber: ' CG-99 ',
          destinationBank: 'MANDIRI',
        }),
      ).toEqual({
        method: 'Check',
        referenceNumber: 'CG-99',
        destinationBank: 'MANDIRI',
      });
    });

    it('clears bank fields for Cash', () => {
      expect(
        normalizePaymentMethodFields({
          method: 'Cash',
          referenceNumber: 'x',
          destinationBank: 'BCA',
        }),
      ).toEqual({
        method: 'Cash',
        referenceNumber: null,
        destinationBank: null,
      });
    });
  });

  describe('getPaymentMethodLabel', () => {
    it('includes account number when available', () => {
      expect(
        getPaymentMethodLabel('Transfer BCA', {
          BCA: { holder: 'PT ACME', account: '1234567890' },
        }),
      ).toBe('Transfer BCA — 1234567890');
    });

    it('omits account when tenant has not configured banks', () => {
      expect(getPaymentMethodLabel('Transfer BCA', {})).toBe('Transfer BCA');
      expect(getPaymentMethodLabel('Transfer Mandiri')).toBe(
        'Transfer Mandiri',
      );
    });

    it('labels Check as Cek / Giro', () => {
      expect(getPaymentMethodLabel('Check')).toBe('Cek / Giro');
    });
  });

  describe('parsePaymentBanksJson', () => {
    it('parses valid tenant banks', () => {
      expect(
        parsePaymentBanksJson(
          JSON.stringify({
            BCA: { holder: 'ACME', account: '111' },
            MANDIRI: { holder: 'ACME', account: '222' },
            OTHER: { holder: 'x', account: '999' },
          }),
        ),
      ).toEqual({
        BCA: { holder: 'ACME', account: '111' },
        MANDIRI: { holder: 'ACME', account: '222' },
      });
    });

    it('returns empty for invalid json', () => {
      expect(parsePaymentBanksJson('not-json')).toEqual({});
      expect(parsePaymentBanksJson(null)).toEqual({});
    });

    it('drops entries without account', () => {
      expect(
        parsePaymentBanksJson(
          JSON.stringify({ BCA: { holder: 'Only', account: '  ' } }),
        ),
      ).toEqual({});
    });
  });

  describe('deriveDestinationBank', () => {
    it('prefers explicit destination bank', () => {
      expect(deriveDestinationBank('Transfer BCA', 'MANDIRI')).toBe('MANDIRI');
    });
  });
});
