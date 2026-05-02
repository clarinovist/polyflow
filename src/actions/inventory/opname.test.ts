import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: <T extends (...args: unknown[]) => unknown>(action: T) => action,
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual = await vi.importActual<typeof import('@/lib/errors/errors')>('@/lib/errors/errors');
    return {
        ...actual,
        safeAction: vi.fn(async (fn: () => Promise<unknown>) => {
            const data = await fn();
            return { success: true, data };
        }),
    };
});

vi.mock('@/lib/core/prisma', () => {
    const stockOpnameItem = {
        count: vi.fn(),
    };

    const tx = {
        stockOpnameItem,
        $executeRaw: vi.fn(),
    };

    return {
        prisma: {
            stockOpnameItem,
            $transaction: vi.fn(async (input: unknown) => {
                if (typeof input === 'function') {
                    return (input as (trx: typeof tx) => Promise<unknown>)(tx);
                }
                return input;
            }),
        },
    };
});

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
    },
}));

import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { saveOpnameCount } from './opname';

describe('saveOpnameCount', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('executes a single transactional bulk update and revalidates path', async () => {
        const items = [
            { id: 'item-1', countedQuantity: 10, notes: 'ok' },
            { id: 'item-2', countedQuantity: 12 },
        ];

        vi.mocked(prisma.stockOpnameItem.count).mockResolvedValue(items.length as never);

        const result = await saveOpnameCount('opname-1', items);

        expect(result).toEqual({ success: true, data: undefined });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.stockOpnameItem.count).toHaveBeenCalledWith({
            where: {
                opnameId: 'opname-1',
                id: { in: ['item-1', 'item-2'] },
            },
        });
        expect(revalidatePath).toHaveBeenCalledWith('/warehouse/opname/opname-1');
    });

    it('rejects duplicate item ids before hitting database', async () => {
        const items = [
            { id: 'item-1', countedQuantity: 10 },
            { id: 'item-1', countedQuantity: 12 },
        ];

        await expect(saveOpnameCount('opname-1', items)).rejects.toThrow('Duplicate stock opname item id in request payload');
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('rejects payload when some item ids are not part of opname session', async () => {
        const items = [
            { id: 'item-1', countedQuantity: 10 },
            { id: 'item-2', countedQuantity: 12 },
        ];

        vi.mocked(prisma.stockOpnameItem.count).mockResolvedValue(1 as never);

        await expect(saveOpnameCount('opname-1', items)).rejects.toThrow('Some stock opname items are invalid for this session');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
