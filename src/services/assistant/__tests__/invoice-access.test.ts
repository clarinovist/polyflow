import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: { invoice: { count: vi.fn() } },
}));

import { prisma } from '@/lib/core/prisma';
import { buildInvoiceAccessGuard } from '../invoice-access';

const count = vi.mocked(prisma.invoice.count);

beforeEach(() => vi.clearAllMocks());

describe('buildInvoiceAccessGuard', () => {
    it('rejects roles without sales access before touching the database', async () => {
        const guard = buildInvoiceAccessGuard({
            userId: 'u1',
            roles: ['WAREHOUSE'],
        });
        await expect(guard('inv1')).rejects.toThrow(/sales/i);
        expect(count).not.toHaveBeenCalled();
    });

    it('allows a sales user for an invoice inside their scope', async () => {
        count.mockResolvedValue(1);
        const guard = buildInvoiceAccessGuard({
            userId: 'u1',
            roles: ['SALES'],
        });
        await expect(guard('inv1')).resolves.toBeUndefined();
        expect(count.mock.calls[0][0]?.where).toMatchObject({ id: 'inv1' });
    });

    it('hides invoices outside the sales scope as not found', async () => {
        count.mockResolvedValue(0);
        const guard = buildInvoiceAccessGuard({
            userId: 'u1',
            roles: ['SALES'],
        });
        await expect(guard('inv1')).rejects.toThrow(/tidak ditemukan/);
    });

    it('lets ADMIN/MARKETING see all open invoices without a rep filter', async () => {
        count.mockResolvedValue(1);
        const guard = buildInvoiceAccessGuard({
            userId: 'u1',
            roles: ['MARKETING'],
        });
        await guard('inv1');
        const where = count.mock.calls[0][0]?.where as Record<string, unknown>;
        expect(where.id).toBe('inv1');
        expect(JSON.stringify(where)).not.toContain('u1');
    });
});
