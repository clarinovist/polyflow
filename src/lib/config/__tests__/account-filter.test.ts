import { describe, expect, it } from 'vitest';
import { filterAccountsByKind } from '../account-filter';

const accounts = [
    { id: '1', code: '11110', name: 'Petty Cash', type: 'ASSET', category: 'CURRENT_ASSET', isCashAccount: true },
    { id: '2', code: '11120', name: 'Bank BCA', type: 'ASSET', category: 'CURRENT_ASSET', isCashAccount: true },
    { id: '3', code: '53200', name: 'Factory Electricity', type: 'EXPENSE', category: 'COGS', isCashAccount: false },
    { id: '4', code: '12100', name: 'Machinery', type: 'ASSET', category: 'FIXED_ASSET', isCashAccount: false },
    { id: '5', code: '21110', name: 'Trade Payables', type: 'LIABILITY', category: 'CURRENT_LIABILITY', isCashAccount: false },
];

describe('filterAccountsByKind', () => {
    it('returns all accounts when filter is undefined', () => {
        expect(filterAccountsByKind(accounts, undefined)).toHaveLength(5);
    });

    it('filters cash-bank by isCashAccount', () => {
        const result = filterAccountsByKind(accounts, { kind: 'cash-bank' });
        expect(result.map((a) => a.code)).toEqual(['11110', '11120']);
    });

    it('filters expense by type', () => {
        const result = filterAccountsByKind(accounts, { kind: 'expense' });
        expect(result.map((a) => a.code)).toEqual(['53200']);
    });

    it('filters fixed-asset by type+category', () => {
        const result = filterAccountsByKind(accounts, { kind: 'fixed-asset' });
        expect(result.map((a) => a.code)).toEqual(['12100']);
    });

    it('filters liability-or-cash', () => {
        const result = filterAccountsByKind(accounts, { kind: 'liability-or-cash' });
        expect(result.map((a) => a.code)).toEqual(['11110', '11120', '21110']);
    });
});
