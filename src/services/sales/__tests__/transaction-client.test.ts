import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.context }));
import { salesTransactionClient } from '../transaction-client';
describe('sales transaction tenant binding', () => {
    it('rejects missing tenant instead of falling back to control database', () => {
        mocks.context.mockReturnValue(undefined);
        expect(() => salesTransactionClient()).toThrow(/tenant/);
    });
    it('returns the exact context client rather than an ambient proxy receiver', async () => {
        const tenant = { $transaction: vi.fn(function(this: unknown) { expect(this).toBe(tenant); return 'tenant-result'; }) };
        mocks.context.mockReturnValue(tenant);
        expect(await salesTransactionClient().$transaction([])).toBe('tenant-result');
    });
});
