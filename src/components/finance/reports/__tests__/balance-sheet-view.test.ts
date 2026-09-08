import { describe, expect, it } from 'vitest';
import {
    buildAccountRows,
    filterBalanceSheetAccounts,
    type BalanceSheetAccount,
} from '../balance-sheet-view';

const accounts: BalanceSheetAccount[] = [
    {
        id: 'asset-root',
        code: '1-0000',
        name: 'Aset Lancar',
        netBalance: 10,
        parentId: null,
    },
    {
        id: 'trade-receivable',
        code: '1-1101',
        name: 'Piutang Dagang',
        netBalance: 20,
        parentId: 'asset-root',
    },
    {
        id: 'customer-receivable',
        code: '1-1101-01',
        name: 'Piutang Pelanggan A',
        netBalance: 30,
        parentId: 'trade-receivable',
    },
];

describe('balance sheet account findability', () => {
    it('finds accounts by dashed or five-digit code and by name without case sensitivity', () => {
        const fiveDigitAccount: BalanceSheetAccount = {
            id: 'trade-payable',
            code: '21101',
            name: 'Hutang Dagang',
            netBalance: 40,
            parentId: null,
        };
        const searchable = [...accounts, fiveDigitAccount];

        expect(filterBalanceSheetAccounts(searchable, '1-1101-01')).toEqual([
            accounts[2],
        ]);
        expect(filterBalanceSheetAccounts(searchable, 'PIUTANG dagang')).toEqual([
            accounts[1],
        ]);
        expect(filterBalanceSheetAccounts(searchable, '21101')).toEqual([
            fiveDigitAccount,
        ]);
    });

    it('uses every flat descendant when a summary group is collapsed', () => {
        const rows = buildAccountRows(accounts, new Set(), true);

        expect(rows).toEqual([
            expect.objectContaining({
                kind: 'group',
                account: accounts[0],
                amount: 60,
                depth: 0,
            }),
        ]);
    });

    it('keeps parent direct balances exactly once while expanding nested groups', () => {
        const rows = buildAccountRows(
            accounts,
            new Set(['asset-root', 'trade-receivable']),
            true,
        );

        expect(rows.map((row) => [row.kind, row.account.id, row.amount])).toEqual([
            ['group', 'asset-root', null],
            ['account', 'asset-root', 10],
            ['group', 'trade-receivable', null],
            ['account', 'trade-receivable', 20],
            ['account', 'customer-receivable', 30],
        ]);
        expect(
            rows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
        ).toBe(60);
    });
});
