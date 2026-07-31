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
    const stockOpnameEntry = {
        create: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
        groupBy: vi.fn(),
    };
    const stockOpnameItem = {
        count: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
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
        stockOpnameEntry,
        inventory,
        $executeRaw: vi.fn(),
    };

    return {
        prisma: {
            stockOpnameItem,
            stockOpname,
            stockOpnameEntry,
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
import {
    createOpnameSession,
    getOpnameSessions,
    saveOpnameCount,
    addOpnameEntry,
    deleteOpnameEntry,
} from '../opname';
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

    it('saveOpnameCount menyinkronkan ulang countedQuantity dari entri', async () => {
        const items = [
            { id: 'item-1', countedQuantity: 999, notes: 'manual' },
        ];

        vi.mocked(prisma.stockOpname.findUnique).mockResolvedValue({ status: 'OPEN' } as never);
        vi.mocked(prisma.stockOpnameItem.count).mockResolvedValue(1 as never);

        // Patch $transaction to capture $executeRaw calls (bulk + re-sync)
        const rawCalls: Array<{ strings?: string[]; values?: unknown[] }> = [];
        type FakeTx = {
            stockOpnameItem: typeof prisma.stockOpnameItem;
            stockOpname: typeof prisma.stockOpname;
            stockOpnameEntry: typeof prisma.stockOpnameEntry;
            $executeRaw: ReturnType<typeof vi.fn>;
        };
        const stubTx = (executeRawFn: ReturnType<typeof vi.fn>): FakeTx => ({
            stockOpnameItem: prisma.stockOpnameItem as unknown as typeof prisma.stockOpnameItem,
            stockOpname: prisma.stockOpname as unknown as typeof prisma.stockOpname,
            stockOpnameEntry: (prisma as unknown as { stockOpnameEntry: typeof prisma.stockOpnameEntry }).stockOpnameEntry,
            $executeRaw: executeRawFn,
        });

        const realMock = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
        const previousImpl = realMock.getMockImplementation();

        const collectingMock = vi.fn(async (input: unknown) => {
            if (typeof input === 'function') {
                const execRaw = vi.fn(async (sql: { strings?: string[] }) => {
                    rawCalls.push(sql as { strings: string[] });
                });
                const fake = stubTx(execRaw);
                return (input as (trx: FakeTx) => Promise<unknown>)(fake);
            }
            return input;
        });

        realMock.mockImplementation(collectingMock as unknown as () => unknown);

        const result = await saveOpnameCount('opname-1', items);

        // Restore
        if (previousImpl) {
            realMock.mockImplementation(previousImpl as unknown as () => unknown);
        } else {
            realMock.mockImplementation(async (cb: unknown) => {
                if (typeof cb === 'function') {
                    const etx = {
                        stockOpnameItem: prisma.stockOpnameItem,
                        stockOpname: prisma.stockOpname,
                        stockOpnameEntry: (prisma as unknown as { stockOpnameEntry: unknown }).stockOpnameEntry,
                        inventory: (prisma as unknown as { inventory: unknown }).inventory,
                        $executeRaw: vi.fn(),
                    };
                    return (cb as (trx: typeof etx) => Promise<unknown>)(etx);
                }
                return cb;
            });
        }

        expect(result).toEqual({ success: true, data: undefined });
        expect(rawCalls.length).toBe(2);
        const secondSql = rawCalls[1] as { strings?: string[] };
        const sqlText = secondSql.strings ? secondSql.strings.join(' ') : '';
        expect(sqlText).toContain('StockOpnameEntry');
        expect(sqlText).toContain('SUM');
        expect(revalidatePath).toHaveBeenCalledWith('/warehouse/opname/opname-1');
    });
});

// ── New: addOpnameEntry / deleteOpnameEntry ──

function makeFakeDecimal(value: number) {
    return {
        toNumber: () => value,
        valueOf: () => value,
    };
}

describe('addOpnameEntry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireRole).mockResolvedValue({
            user: { id: 'user-1', role: 'WAREHOUSE' },
        } as never);
    });

    it('addOpnameEntry membuat entri dan memperbarui countedQuantity dengan total entri', async () => {
        // Arrange
        vi.mocked(prisma.stockOpnameItem.findUnique).mockResolvedValue({
            id: 'item-1',
            opname: { status: 'OPEN' },
        } as never);
        vi.mocked(prisma.stockOpnameEntry.count).mockResolvedValue(2 as never);
        vi.mocked(prisma.stockOpnameEntry.create).mockResolvedValue({
            id: 'entry-new',
            quantity: makeFakeDecimal(45.3),
            label: null,
            createdAt: new Date('2026-07-31T10:00:00Z'),
        } as never);
        // Existing 44 + 37 + new 45.3 = 126.3
        vi.mocked(prisma.stockOpnameEntry.aggregate).mockResolvedValue({
            _sum: { quantity: makeFakeDecimal(126.3) },
        } as never);
        vi.mocked(prisma.stockOpnameItem.update).mockResolvedValue({} as never);

        // Act
        const result = await addOpnameEntry('item-1', 45.3);

        // Assert
        expect(result.success).toBe(true);
        const data = (result as { success: true; data: { countedQuantity: number; entryCount: number } }).data;
        expect(data.countedQuantity).toBe(126.3);
        expect(data.entryCount).toBe(3);

        expect(prisma.stockOpnameEntry.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    opnameItemId: 'item-1',
                    quantity: 45.3,
                }),
            }),
        );
        expect(prisma.stockOpnameItem.update).toHaveBeenCalledWith({
            where: { id: 'item-1' },
            data: { countedQuantity: 126.3 },
        });
        // Must NOT revalidate per-entry
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('addOpnameEntry menolak jumlah nol atau negatif', async () => {
        await expect(addOpnameEntry('item-1', 0)).rejects.toThrow('Jumlah harus lebih dari 0');
        await expect(addOpnameEntry('item-1', -5)).rejects.toThrow('Jumlah harus lebih dari 0');
        await expect(addOpnameEntry('item-1', NaN)).rejects.toThrow('Jumlah harus lebih dari 0');
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('addOpnameEntry menolak sesi yang tidak OPEN', async () => {
        vi.mocked(prisma.stockOpnameItem.findUnique).mockResolvedValue({
            id: 'item-1',
            opname: { status: 'COMPLETED' },
        } as never);

        await expect(addOpnameEntry('item-1', 10)).rejects.toThrow('Hanya sesi OPEN yang dapat diupdate');
    });

    it('addOpnameEntry menolak saat entri sudah mencapai batas maksimum', async () => {
        vi.mocked(prisma.stockOpnameItem.findUnique).mockResolvedValue({
            id: 'item-1',
            opname: { status: 'OPEN' },
        } as never);
        vi.mocked(prisma.stockOpnameEntry.count).mockResolvedValue(500 as never);

        await expect(addOpnameEntry('item-1', 10)).rejects.toThrow('Maksimal 500 entri per item');
    });

    it('addOpnameEntry menolak label yang terlalu panjang', async () => {
        const longLabel = 'x'.repeat(101);
        await expect(addOpnameEntry('item-1', 10, longLabel)).rejects.toThrow('Label maksimal 100 karakter');
    });
});

describe('deleteOpnameEntry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireRole).mockResolvedValue({
            user: { id: 'user-1', role: 'WAREHOUSE' },
        } as never);
    });

    it('deleteOpnameEntry menghitung ulang countedQuantity setelah penghapusan', async () => {
        vi.mocked(prisma.stockOpnameEntry.findUnique).mockResolvedValue({
            id: 'entry-2',
            opnameItemId: 'item-1',
            opnameItem: {
                opnameId: 'opname-1',
                opname: { status: 'OPEN' },
            },
        } as never);
        vi.mocked(prisma.stockOpnameEntry.delete).mockResolvedValue({} as never);
        vi.mocked(prisma.stockOpnameEntry.aggregate).mockResolvedValue({
            _sum: { quantity: makeFakeDecimal(82.3) },
        } as never);
        vi.mocked(prisma.stockOpnameEntry.count).mockResolvedValue(2 as never);
        vi.mocked(prisma.stockOpnameItem.update).mockResolvedValue({} as never);

        const result = await deleteOpnameEntry('entry-2');

        expect(result.success).toBe(true);
        const data = (result as { success: true; data: { countedQuantity: number | null; entryCount: number } }).data;
        expect(data.countedQuantity).toBe(82.3);
        expect(data.entryCount).toBe(2);

        expect(prisma.stockOpnameItem.update).toHaveBeenCalledWith({
            where: { id: 'item-1' },
            data: { countedQuantity: 82.3 },
        });
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('deleteOpnameEntry mengembalikan countedQuantity ke null saat entri terakhir dihapus', async () => {
        vi.mocked(prisma.stockOpnameEntry.findUnique).mockResolvedValue({
            id: 'entry-last',
            opnameItemId: 'item-1',
            opnameItem: {
                opnameId: 'opname-1',
                opname: { status: 'OPEN' },
            },
        } as never);
        vi.mocked(prisma.stockOpnameEntry.delete).mockResolvedValue({} as never);
        vi.mocked(prisma.stockOpnameEntry.aggregate).mockResolvedValue({
            _sum: { quantity: null },
        } as never);
        vi.mocked(prisma.stockOpnameEntry.count).mockResolvedValue(0 as never);
        vi.mocked(prisma.stockOpnameItem.update).mockResolvedValue({} as never);

        const result = await deleteOpnameEntry('entry-last');

        expect(result.success).toBe(true);
        const data = (result as { success: true; data: { countedQuantity: number | null; entryCount: number } }).data;
        expect(data.countedQuantity).toBeNull();
        expect(data.entryCount).toBe(0);

        expect(prisma.stockOpnameItem.update).toHaveBeenCalledWith({
            where: { id: 'item-1' },
            data: { countedQuantity: null },
        });
    });

    it('deleteOpnameEntry menolak sesi yang tidak OPEN', async () => {
        vi.mocked(prisma.stockOpnameEntry.findUnique).mockResolvedValue({
            id: 'entry-1',
            opnameItemId: 'item-1',
            opnameItem: {
                opnameId: 'opname-1',
                opname: { status: 'COMPLETED' },
            },
        } as never);

        await expect(deleteOpnameEntry('entry-1')).rejects.toThrow('Hanya sesi OPEN yang dapat diupdate');
    });

    it('deleteOpnameEntry menolak user tanpa role yang berwenang', async () => {
        vi.mocked(requireRole).mockRejectedValue(new AuthorizationError('Tidak memiliki izin yang cukup'));

        await expect(deleteOpnameEntry('entry-1')).rejects.toThrow(AuthorizationError);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
