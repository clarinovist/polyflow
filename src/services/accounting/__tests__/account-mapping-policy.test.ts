import { describe, expect, it } from 'vitest';
import { getInventoryAccount, GL_ACCOUNT_CODES, resolveAccountCode } from '../account-mapping-policy';

describe('account-mapping-policy', () => {
    it('resolves correct inventory account codes for each product type', () => {
        expect(getInventoryAccount('RAW_MATERIAL')).toBe(GL_ACCOUNT_CODES.INVENTORY_RAW_MATERIAL);
        expect(getInventoryAccount('FINISHED_GOOD')).toBe(GL_ACCOUNT_CODES.INVENTORY_FINISHED_GOOD);
        expect(getInventoryAccount('WIP')).toBe(GL_ACCOUNT_CODES.INVENTORY_WIP);
        expect(getInventoryAccount('INTERMEDIATE')).toBe(GL_ACCOUNT_CODES.INVENTORY_WIP);
        expect(getInventoryAccount('SCRAP')).toBe(GL_ACCOUNT_CODES.INVENTORY_SCRAP);
        expect(getInventoryAccount('PACKAGING')).toBe(GL_ACCOUNT_CODES.INVENTORY_PACKAGING);
    });

    it('resolves default inventory account code for unknown product type', () => {
        expect(getInventoryAccount('UNKNOWN')).toBe(GL_ACCOUNT_CODES.INVENTORY_DEFAULT);
    });

    it('resolves account codes by posting context', () => {
        expect(resolveAccountCode('FINISHED_GOOD', 'inventory')).toBe(GL_ACCOUNT_CODES.INVENTORY_FINISHED_GOOD);
        expect(resolveAccountCode('RAW_MATERIAL', 'trade-payable')).toBe(GL_ACCOUNT_CODES.TRADE_PAYABLE);
        expect(resolveAccountCode('RAW_MATERIAL', 'cogs')).toBe(GL_ACCOUNT_CODES.COGS_DEFAULT);
        expect(resolveAccountCode('RAW_MATERIAL', 'wip')).toBe(GL_ACCOUNT_CODES.INVENTORY_WIP);
        expect(resolveAccountCode('RAW_MATERIAL', 'adjustment-gain')).toBe(GL_ACCOUNT_CODES.ADJUSTMENT_GAIN);
        expect(resolveAccountCode('RAW_MATERIAL', 'adjustment-loss')).toBe(GL_ACCOUNT_CODES.ADJUSTMENT_LOSS);
        expect(resolveAccountCode(null, 'manufacturing-overhead')).toBe(GL_ACCOUNT_CODES.MANUFACTURING_OVERHEAD);
        expect(resolveAccountCode(null, 'accrued-liabilities')).toBe(GL_ACCOUNT_CODES.ACCRUED_LIABILITIES);
    });
});
