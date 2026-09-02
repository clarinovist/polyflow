import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDailyBoardData } from '../daily-board-data';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findMany: vi.fn() },
        bom: { findMany: vi.fn() },
        machine: { findMany: vi.fn() },
        appSetting: { findUnique: vi.fn() },
    },
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

function decimal(value: number) {
    return { toNumber: () => value };
}

describe('getDailyBoardData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null as never);
    });

    it('queries only active statuses (no COMPLETED/CANCELLED)', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.bom.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.machine.findMany).mockResolvedValue([] as never);

        await getDailyBoardData();

        expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: {
                        in: ['RELEASED', 'IN_PROGRESS', 'WAITING_MATERIAL'],
                    },
                },
            }),
        );
    });

    it('maps Decimal fields to numbers and includes executions', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            {
                id: 'wo-1',
                orderNumber: 'WO-260901-001',
                status: 'IN_PROGRESS',
                plannedQuantity: decimal(100),
                plannedEnteredQuantity: decimal(100),
                plannedEnteredUnit: 'KG',
                plannedConversionFactorSnapshot: decimal(1),
                actualQuantity: decimal(45.5),
                plannedStartDate: new Date('2026-09-01T00:00:00Z'),
                notes: null,
                isMaklon: false,
                priority: 'NORMAL',
                machineId: 'm1',
                bom: {
                    id: 'b1',
                    name: 'BOM A',
                    category: 'EXTRUSION',
                    productVariant: {
                        id: 'v1',
                        name: 'Variant A',
                        primaryUnit: 'KG',
                        salesUnit: 'BAL',
                        conversionFactor: decimal(20),
                        product: { id: 'p1', name: 'Product A' },
                    },
                },
                machine: { id: 'm1', name: 'EX-1', code: 'EX-1' },
                plannedMaterials: [
                    {
                        id: 'pm1',
                        productVariantId: 'v2',
                        quantity: decimal(50),
                    },
                ],
                executions: [
                    {
                        id: 'e1',
                        quantityProduced: decimal(30),
                        scrapQuantity: decimal(2),
                        scrapProngkolQty: decimal(0),
                        scrapDaunQty: decimal(0),
                        startTime: new Date('2026-09-01T02:00:00Z'),
                        endTime: new Date('2026-09-01T04:00:00Z'),
                        status: 'COMPLETED',
                    },
                ],
            },
        ] as never);
        vi.mocked(prisma.bom.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.machine.findMany).mockResolvedValue([] as never);

        const result = await getDailyBoardData();

        expect(result.success).toBe(true);
        if (!result.success) return;
        const order = result.data.orders[0];
        expect(order.plannedQuantity).toBe(100);
        expect(order.actualQuantity).toBe(45.5);
        expect(order.executions).toHaveLength(1);
        expect(order.executions[0].quantityProduced).toBe(30);
        expect(order.executions[0].scrapQuantity).toBe(2);
        expect(order.plannedMaterials[0].quantity).toBe(50);
    });

    it('fetches default active BOMs, active machines, and parses stage map', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.bom.findMany).mockResolvedValue([
            {
                id: 'b1',
                name: 'BOM A',
                category: 'MIXING',
                productVariant: {
                    id: 'v1',
                    name: 'Variant A',
                    product: { id: 'p1', name: 'Product A' },
                },
            },
        ] as never);
        vi.mocked(prisma.machine.findMany).mockResolvedValue([
            {
                id: 'm1',
                name: 'Mixer 1',
                code: 'MX-1',
                type: 'MIXER',
                status: 'ACTIVE',
            },
        ] as never);
        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
            value: JSON.stringify({ MIXING: ['MIXER'] }),
        } as never);

        const result = await getDailyBoardData();

        expect(prisma.bom.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { isActive: true, isDefault: true },
            }),
        );
        expect(prisma.machine.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status: 'ACTIVE' },
            }),
        );
        if (!result.success) throw new Error('expected success');
        expect(result.data.boms).toHaveLength(1);
        expect(result.data.machines).toHaveLength(1);
        expect(result.data.machineStageMap).toEqual({ MIXING: ['MIXER'] });
    });
});
