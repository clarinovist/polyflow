import { describe, it, expect } from 'vitest';
import {
  normalizePaymentMethodFields,
  getPaymentMethodLabel,
  getClearingBankLabel,
  getClearingBankOptions,
  getSelectablePaymentMethods,
  deriveDestinationBank,
  type TenantPaymentBanks,
} from '../payment-methods';
import { parsePaymentBanksJson } from '@/services/settings/app-settings-service';

const BRI: TenantPaymentBanks = [
  {
    key: 'BRI',
    name: 'BRI',
    holder: 'PT ACME',
    account: '333',
    glAccountId: 'acc-bri',
  },
];

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

    it('normalizes a tenant-configured third bank (Transfer BRI)', () => {
      expect(
        normalizePaymentMethodFields({ method: 'Transfer BRI' }, BRI),
      ).toEqual({
        method: 'Transfer BRI',
        referenceNumber: null,
        destinationBank: 'BRI',
      });
    });

    it('rejects a method for a bank the tenant has not configured', () => {
      expect(() =>
        normalizePaymentMethodFields({ method: 'Transfer BRI' }, []),
      ).toThrow(/tidak dikenali/);
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

    it('allows a configured third bank as Check clearing destination', () => {
      expect(
        normalizePaymentMethodFields(
          {
            method: 'Check',
            referenceNumber: 'CG-100',
            destinationBank: 'BRI',
          },
          BRI,
        ),
      ).toEqual({
        method: 'Check',
        referenceNumber: 'CG-100',
        destinationBank: 'BRI',
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

  describe('getSelectablePaymentMethods', () => {
    it('always includes BCA/Mandiri/Cash/Check even with no banks configured', () => {
      expect(getSelectablePaymentMethods([])).toEqual([
        'Transfer BCA',
        'Transfer Mandiri',
        'Cash',
        'Check',
      ]);
    });

    it('appends tenant-configured extra banks', () => {
      expect(getSelectablePaymentMethods(BRI)).toEqual([
        'Transfer BCA',
        'Transfer Mandiri',
        'Transfer BRI',
        'Cash',
        'Check',
      ]);
    });
  });

  describe('getPaymentMethodLabel', () => {
    it('includes account number when available', () => {
      expect(
        getPaymentMethodLabel('Transfer BCA', [
          { key: 'BCA', name: 'BCA', holder: 'PT ACME', account: '1234567890' },
        ]),
      ).toBe('Transfer BCA — 1234567890');
    });

    it('omits account when tenant has not configured banks', () => {
      expect(getPaymentMethodLabel('Transfer BCA', [])).toBe('Transfer BCA');
      expect(getPaymentMethodLabel('Transfer Mandiri')).toBe(
        'Transfer Mandiri',
      );
    });

    it('labels Check as Cek / Giro', () => {
      expect(getPaymentMethodLabel('Check')).toBe('Cek / Giro');
    });

    it('labels a tenant-configured third bank with account number', () => {
      expect(getPaymentMethodLabel('Transfer BRI', BRI)).toBe(
        'Transfer BRI — 333',
      );
    });
  });

  describe('getClearingBankLabel / getClearingBankOptions', () => {
    it('labels legacy banks with account number', () => {
      expect(
        getClearingBankLabel('BCA', [
          { key: 'BCA', name: 'BCA', holder: 'x', account: '111' },
        ]),
      ).toBe('BCA — 111');
    });

    it('lists BCA/Mandiri plus any extra configured banks', () => {
      expect(getClearingBankOptions(BRI)).toEqual([
        { key: 'BCA', label: 'BCA' },
        { key: 'MANDIRI', label: 'Mandiri' },
        { key: 'BRI', label: 'BRI — 333' },
      ]);
    });
  });

  describe('parsePaymentBanksJson', () => {
    it('parses legacy BCA/MANDIRI shape and drops unrecognized malformed rows', () => {
      expect(
        parsePaymentBanksJson(
          JSON.stringify({
            BCA: { holder: 'ACME', account: '111' },
            MANDIRI: { holder: 'ACME', account: '222' },
          }),
        ),
      ).toEqual([
        { key: 'BCA', name: 'BCA', holder: 'ACME', account: '111' },
        { key: 'MANDIRI', name: 'Mandiri', holder: 'ACME', account: '222' },
      ]);
    });

    it('returns empty for invalid json', () => {
      expect(parsePaymentBanksJson('not-json')).toEqual([]);
      expect(parsePaymentBanksJson(null)).toEqual([]);
    });

    it('drops entries without account', () => {
      expect(
        parsePaymentBanksJson(
          JSON.stringify({ BCA: { holder: 'Only', account: '  ' } }),
        ),
      ).toEqual([]);
    });
  });

  describe('deriveDestinationBank', () => {
    it('prefers explicit destination bank', () => {
      expect(deriveDestinationBank('Transfer BCA', 'MANDIRI')).toBe(
        'MANDIRI',
      );
    });

    it('derives from a tenant-configured third bank method', () => {
      expect(deriveDestinationBank('Transfer BRI', null, BRI)).toBe('BRI');
    });
  });
});
