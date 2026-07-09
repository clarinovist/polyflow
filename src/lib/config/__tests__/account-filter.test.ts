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

import { filterAccountsForRole } from '../account-filter';

describe('filterAccountsForRole', () => {
    const accounts = [
        { id: '1', code: '11120', name: 'BCA', type: 'ASSET', isCashAccount: true, isActive: true },
        { id: '2', code: '53200', name: 'Listrik', type: 'EXPENSE', isCashAccount: false, isActive: true },
        { id: '3', code: '12100', name: 'Mesin', type: 'ASSET', category: 'FIXED_ASSET', isActive: true },
        { id: '4', code: '21110', name: 'AP', type: 'LIABILITY', isActive: true },
    ];

    it('prefers cash accounts for bank-bca', () => {
        expect(filterAccountsForRole('bank-bca', accounts).map((a) => a.code)).toEqual(['11120']);
    });

    it('prefers expense accounts for factory-electricity', () => {
        expect(filterAccountsForRole('factory-electricity', accounts).map((a) => a.code)).toEqual(['53200']);
    });

    it('falls back to all active when no type match', () => {
        const onlyCash = accounts.filter((a) => a.isCashAccount);
        // equity role with no equity accounts → all active from input
        expect(filterAccountsForRole('current-year-earnings', onlyCash).length).toBe(1);
    });
});
