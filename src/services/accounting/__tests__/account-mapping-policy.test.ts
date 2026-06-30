import { describe, expect, it, vi } from 'vitest';
import { getInventoryAccount, GL_ACCOUNT_CODES, resolveAccountCode } from '../account-mapping-policy';

// Mock the account-resolver to avoid database calls in tests
vi.mock('../account-resolver', () => ({
    resolveAccount: vi.fn().mockImplementation(async (role: string) => {
        const mockAccounts: Record<string, { id: string; code: string; name: string }> = {
            'raw-material': { id: 'acc-1', code: '11310', name: 'Raw Materials' },
            'finished-goods': { id: 'acc-2', code: '11330', name: 'Finished Goods' },
            'wip': { id: 'acc-3', code: '11320', name: 'Work in Progress' },
            'scrap': { id: 'acc-4', code: '11350', name: 'Scrap' },
            'packaging': { id: 'acc-5', code: '11340', name: 'Packaging' },
            'inventory': { id: 'acc-6', code: '11300', name: 'Inventory' },
            'accounts-payable': { id: 'acc-7', code: '21110', name: 'Trade Payable' },
            'cogs': { id: 'acc-8', code: '50000', name: 'COGS' },
            'adjustment-gain': { id: 'acc-9', code: '81100', name: 'Adjustment Gain' },
            'adjustment-loss': { id: 'acc-10', code: '91100', name: 'Adjustment Loss' },
            'manufacturing-overhead': { id: 'acc-11', code: '51100', name: 'Manufacturing Overhead' },
            'accrued-liabilities': { id: 'acc-12', code: '21200', name: 'Accrued Liabilities' },
        };
        return mockAccounts[role] || { id: 'acc-default', code: '00000', name: 'Unknown' };
    }),
}));

describe('account-mapping-policy', () => {
    it('resolves correct inventory account codes for each product type', async () => {
        const rm = await getInventoryAccount('RAW_MATERIAL');
        expect(rm.code).toBe(GL_ACCOUNT_CODES.INVENTORY_RAW_MATERIAL);

        const fg = await getInventoryAccount('FINISHED_GOOD');
        expect(fg.code).toBe(GL_ACCOUNT_CODES.INVENTORY_FINISHED_GOOD);

        const wip = await getInventoryAccount('WIP');
        expect(wip.code).toBe(GL_ACCOUNT_CODES.INVENTORY_WIP);

        const inter = await getInventoryAccount('INTERMEDIATE');
        expect(inter.code).toBe(GL_ACCOUNT_CODES.INVENTORY_WIP);

        const scrap = await getInventoryAccount('SCRAP');
        expect(scrap.code).toBe(GL_ACCOUNT_CODES.INVENTORY_SCRAP);

        const pack = await getInventoryAccount('PACKAGING');
        expect(pack.code).toBe(GL_ACCOUNT_CODES.INVENTORY_PACKAGING);
    });

    it('resolves default inventory account code for unknown product type', async () => {
        const result = await getInventoryAccount('UNKNOWN');
        expect(result.code).toBe(GL_ACCOUNT_CODES.INVENTORY_DEFAULT);
    });

    it('resolves account codes by posting context', async () => {
        const inv = await resolveAccountCode('FINISHED_GOOD', 'inventory');
        expect(inv.code).toBe(GL_ACCOUNT_CODES.INVENTORY_FINISHED_GOOD);

        const tp = await resolveAccountCode('RAW_MATERIAL', 'trade-payable');
        expect(tp.code).toBe(GL_ACCOUNT_CODES.TRADE_PAYABLE);

        const cogs = await resolveAccountCode('RAW_MATERIAL', 'cogs');
        expect(cogs.code).toBe(GL_ACCOUNT_CODES.COGS_DEFAULT);

        const wip = await resolveAccountCode('RAW_MATERIAL', 'wip');
        expect(wip.code).toBe(GL_ACCOUNT_CODES.INVENTORY_WIP);

        const gain = await resolveAccountCode('RAW_MATERIAL', 'adjustment-gain');
        expect(gain.code).toBe(GL_ACCOUNT_CODES.ADJUSTMENT_GAIN);

        const loss = await resolveAccountCode('RAW_MATERIAL', 'adjustment-loss');
        expect(loss.code).toBe(GL_ACCOUNT_CODES.ADJUSTMENT_LOSS);

        const overhead = await resolveAccountCode(null, 'manufacturing-overhead');
        expect(overhead.code).toBe(GL_ACCOUNT_CODES.MANUFACTURING_OVERHEAD);

        const accrued = await resolveAccountCode(null, 'accrued-liabilities');
        expect(accrued.code).toBe(GL_ACCOUNT_CODES.ACCRUED_LIABILITIES);
    });
});
