import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findMany: vi.fn() },
        productionPackagingOption: { findMany: vi.fn() },
        inventory: { groupBy: vi.fn() },
    },
}));

import { prisma } from '@/lib/core/prisma';
import { listKioskJobs } from '../kiosk-job-service';

const order = (overrides: Record<string, unknown> = {}) => ({
    id: 'spk-1',
    orderNumber: 'WO-001',
    status: 'IN_PROGRESS',
    plannedQuantity: new Prisma.Decimal(200),
    plannedEnteredQuantity: null,
    plannedEnteredUnit: null,
    plannedConversionFactorSnapshot: null,
    actualQuantity: new Prisma.Decimal(80),
    executionModeSnapshot: 'GENERIC',
    actualPackagingEnabled: false,
    requestedOutputVariantId: null,
    bom: {
        productVariant: {
            name: 'Tali Rafia 1 kg',
            primaryUnit: 'KG',
            salesUnit: null,
            conversionFactor: new Prisma.Decimal(1),
        },
    },
    machine: { id: 'm-2', name: 'Mesin 2' },
    executions: [{ id: 'exec-1' }],
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.productionPackagingOption.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.inventory.groupBy).mockResolvedValue([] as never);
});

describe('listKioskJobs', () => {
    it('reads no price or cost fields for the public kiosk', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([] as never);

        await listKioskJobs();

        const args = vi.mocked(prisma.productionOrder.findMany).mock.calls[0][0] as { select: Record<string, unknown> };
        expect(args.select).toBeDefined();
        expect(JSON.stringify(args.select)).not.toMatch(/price|cost|Cost|buyPrice|standardCost/);
    });

    it('returns plain numbers and marks running SPKs', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            order(),
            order({ id: 'spk-2', orderNumber: 'WO-002', executions: [], machine: null, actualQuantity: null }),
        ] as never);

        const [running, ready] = await listKioskJobs();

        expect(running).toMatchObject({ id: 'spk-1', isRunning: true, plannedQuantity: 200, actualQuantity: 80, productName: 'Tali Rafia 1 kg', packaging: null });
        expect(running.unit.conversionFactor).toBe(1);
        expect(ready).toMatchObject({ isRunning: false, machine: null, actualQuantity: 0 });
    });

    it('names the mapped etiket and its kiosk-visible stock for actual-packaging SPKs', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            order({ actualPackagingEnabled: true, requestedOutputVariantId: 'brand-a' }),
            order({ id: 'spk-2', actualPackagingEnabled: true, requestedOutputVariantId: null }),
        ] as never);
        vi.mocked(prisma.productionPackagingOption.findMany).mockResolvedValue([
            { outputVariantId: 'brand-a', labelVariantId: 'label-a', labelVariant: { name: 'Etiket Merek A' } },
        ] as never);
        vi.mocked(prisma.inventory.groupBy).mockResolvedValue([
            { productVariantId: 'label-a', _sum: { quantity: new Prisma.Decimal(3200) } },
        ] as never);

        const [mapped, unmapped] = await listKioskJobs();

        expect(mapped.packaging).toEqual({ labelName: 'Etiket Merek A', labelStock: 3200 });
        expect(unmapped.packaging).toEqual({ labelName: null, labelStock: null });
        expect(vi.mocked(prisma.productionPackagingOption.findMany).mock.calls[0][0]).toMatchObject({
            where: { outputVariantId: { in: ['brand-a'] } },
        });
    });
});
