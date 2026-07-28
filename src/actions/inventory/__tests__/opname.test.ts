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
    const stockOpname = {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
    };
    const inventory = {
        findMany: vi.fn(),
    };

    const tx = {
        stockOpnameItem,
        stockOpname,
        inventory,
        $executeRaw: vi.fn(),
    };

    return {
        prisma: {
            stockOpnameItem,
            stockOpname,
            inventory,
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

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'user-1' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'user-1', role: 'WAREHOUSE' } })),
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
    },
}));

import { prisma } from '@/lib/core/prisma';
import { requireRole } from '@/lib/tools/auth-checks';
import { revalidatePath } from 'next/cache';
import { createOpnameSession, getOpnameSessions, saveOpnameCount } from '../opname';
import { AuthorizationError } from '@/lib/errors/errors';
import { Prisma } from '@prisma/client';

describe('createOpnameSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireRole).mockResolvedValue({
            user: { id: 'user-1', role: 'WAREHOUSE' },
        } as never);
    });

    it('creates a new opname session when location has inventory and no open session exists', async () => {
        vi.mocked(prisma.stockOpname.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([
            { id: 'inv-1', productVariantId: 'var-1', quantity: 100, locationId: 'loc-1' },
        ] as never);
        vi.mocked(prisma.stockOpname.create).mockResolvedValue({
            id: 'opname-new-1',
        } as never);

        const result = await createOpnameSession('loc-1', 'Catatan opname');

        expect(result).toEqual({ success: true, data: { id: 'opname-new-1' } });
        expect(requireRole).toHaveBeenCalledTimes(1);
        expect(prisma.stockOpname.findFirst).toHaveBeenCalledWith({
            where: { locationId: 'loc-1', status: 'OPEN' },
            select: { id: true, opnameNumber: true },
        });
        expect(prisma.stockOpname.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                locationId: 'loc-1',
                remarks: 'Catatan opname',
                status: 'OPEN',
                createdById: 'user-1',
            }),
        });
        expect(revalidatePath).toHaveBeenCalledWith('/warehouse/opname');
        expect(revalidatePath).toHaveBeenCalledWith('/warehouse/mobile/opname');
    });

    it('throws authorization error if user does not have required role', async () => {
        vi.mocked(requireRole).mockRejectedValue(
            new AuthorizationError('Tidak memiliki izin yang cukup'),
        );

        await expect(createOpnameSession('loc-1')).rejects.toThrow(
            AuthorizationError,
        );
        expect(prisma.stockOpname.create).not.toHaveBeenCalled();
    });

    it('rejects creation if an open session already exists for the location', async () => {
        vi.mocked(prisma.stockOpname.findFirst).mockResolvedValue({
            id: 'opname-existing',
            opnameNumber: 'OPN-202607-0001',
        } as never);

        await expect(createOpnameSession('loc-1')).rejects.toThrow(
            'Lokasi ini sudah memiliki sesi Stock Opname aktif (OPN-202607-0001)',
        );
        expect(prisma.inventory.findMany).not.toHaveBeenCalled();
        expect(prisma.stockOpname.create).not.toHaveBeenCalled();
    });

    it('catches Prisma P2002 error and converts to BusinessRuleError', async () => {
        vi.mocked(prisma.stockOpname.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([
            { id: 'inv-1', productVariantId: 'var-1', quantity: 10, locationId: 'loc-1' },
        ] as never);

        const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '5.22.0',
        });
        vi.mocked(prisma.stockOpname.create).mockRejectedValue(p2002Error);

        await expect(createOpnameSession('loc-1')).rejects.toThrow(
            'Lokasi ini sudah memiliki sesi Stock Opname yang sedang aktif.',
        );
    });

    it('rejects creation if location has no inventory items', async () => {
        vi.mocked(prisma.stockOpname.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

        await expect(createOpnameSession('loc-empty')).rejects.toThrow(
            'Tidak ada inventori di lokasi ini untuk dilakukan stock opname.',
        );
        expect(prisma.stockOpname.create).not.toHaveBeenCalled();
    });

    it('rejects invalid location input', async () => {
        await expect(createOpnameSession('')).rejects.toThrow('Lokasi harus dipilih');
    });

    it('rejects remarks that exceed maximum length', async () => {
        const longRemarks = 'a'.repeat(501);
        await expect(createOpnameSession('loc-1', longRemarks)).rejects.toThrow(
            'Remarks maksimal 500 karakter',
        );
    });
});

describe('getOpnameSessions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queries stock opnames with location, createdBy, and items select', async () => {
        const mockSessions = [
            {
                id: 'opname-1',
                opnameNumber: 'OPN-202607-0001',
                status: 'OPEN',
                location: { name: 'Main Warehouse' },
                createdBy: { name: 'Admin' },
                items: [{ id: 'item-1', countedQuantity: 5 }],
            },
        ];
        vi.mocked(prisma.stockOpname.findMany).mockResolvedValue(mockSessions as never);

        const result = await getOpnameSessions();

        expect(result).toEqual({ success: true, data: mockSessions });
        expect(prisma.stockOpname.findMany).toHaveBeenCalledWith({
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                location: true,
                createdBy: true,
                items: {
                    select: {
                        id: true,
                        countedQuantity: true,
                    },
                },
            },
        });
    });
});

describe('saveOpnameCount', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('executes a single transactional bulk update and revalidates path', async () => {
        const items = [
            { id: 'item-1', countedQuantity: 10, notes: 'ok' },
            { id: 'item-2', countedQuantity: 12 },
        ];

        vi.mocked(prisma.stockOpname.findUnique).mockResolvedValue({ status: 'OPEN' } as never);
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
        expect(revalidatePath).toHaveBeenCalledWith('/warehouse/mobile/opname/opname-1');
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

        vi.mocked(prisma.stockOpname.findUnique).mockResolvedValue({ status: 'OPEN' } as never);
        vi.mocked(prisma.stockOpnameItem.count).mockResolvedValue(1 as never);

        await expect(saveOpnameCount('opname-1', items)).rejects.toThrow('Some stock opname items are invalid for this session');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
