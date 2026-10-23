import { describe, expect, it } from 'vitest';
import { internalUsageSchema, internalUsageFiltersSchema } from '../internal-usage';
import { isRoleCompatibleAccount } from '@/services/accounting/account-resolver';
import type { Account } from '@prisma/client';
const input = { requestId: '915468eb-b0d5-441c-817c-7985e2e2e8d2', productVariantId: 'pen', locationId: 'office', quantity: 3, unit: 'PCS', date: '2026-10-23', recipient: ' Staff ', department: ' Admin ', purpose: ' Writing ' };
describe('internal usage input contract', () => {
    it('normalizes whitespace and strips untrusted journal/actor fields', () => {
        expect(internalUsageSchema.parse({ ...input, actorId: 'forged', expenseAccountId: 'forged' })).toEqual({ ...input, recipient: 'Staff', department: 'Admin', purpose: 'Writing' });
    });
    it.each([{ date: '2026-02-30' }, { date: 'invalid' }, { quantity: 0 }, { quantity: -3 }, { quantity: NaN }, { quantity: 1.00001 }, { requestId: 'bad' }, { purpose: '  ' }, { recipient: '  ' }, { department: '  ' }])('rejects invalid payload %#', (change) => {
        expect(internalUsageSchema.safeParse({ ...input, ...change }).success).toBe(false);
    });
    it('accepts four-decimal quantity and bounded filters', () => {
        expect(internalUsageSchema.safeParse({ ...input, quantity: 1.2345, unit: 'KG' }).success).toBe(true);
        expect(internalUsageFiltersSchema.parse({})).toEqual({ query: '', department: '', page: 1 });
        expect(internalUsageFiltersSchema.safeParse({ page: 0 }).success).toBe(false);
    });
    it('Finance can only select operating expense, not COGS or assets', () => {
        expect(isRoleCompatibleAccount('internal-usage-expense', { name: 'ATK', type: 'EXPENSE', category: 'OPERATING_EXPENSE' } as Account)).toBe(true);
        expect(isRoleCompatibleAccount('internal-usage-expense', { name: 'COGS', type: 'EXPENSE', category: 'COGS' } as Account)).toBe(false);
        expect(isRoleCompatibleAccount('internal-usage-expense', { name: 'Asset', type: 'ASSET', category: 'CURRENT_ASSET' } as Account)).toBe(false);
    });
});
