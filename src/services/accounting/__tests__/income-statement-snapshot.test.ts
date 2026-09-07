import { expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
vi.mock('@/lib/core/prisma', () => ({ prisma: { account: { findMany: vi.fn().mockResolvedValue([]) } } }));
import { prisma } from '@/lib/core/prisma';
import { getIncomeStatement } from '../reports-service';
it('binds income statement to the supplied transaction, never the ambient proxy', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'revenue', code: 'R', name: 'Revenue', type: 'REVENUE', category: 'OPERATING_REVENUE', journalLines: [{ debit: 0, credit: 123 }] }]);
    const tx = { account: { findMany } } as unknown as Prisma.TransactionClient;
    const result = await getIncomeStatement(new Date('2026-08-01Z'), new Date('2026-08-31Z'), tx);
    expect(result.totalRevenue).toBe(123);
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { journalLines: { where: { journalEntry: { entryDate: expect.any(Object), status: 'POSTED', NOT: { reference: { startsWith: 'CLOSING-' } } } } } } }));
});
