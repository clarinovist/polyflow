import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findUnique: vi.fn() },
        productionShift: { findMany: vi.fn() },
        productVariant: { findMany: vi.fn() },
        productionPackagingConsumption: { findMany: vi.fn() },
    },
}));

import { prisma } from '@/lib/core/prisma';
import { loadKioskFocus } from '../kiosk-focus-service';

const at = (iso: string) => new Date(iso);
const execution = (overrides: Record<string, unknown>) => ({
    id: 'exec-1',
    startTime: at('2026-10-26T02:00:00Z'),
    endTime: at('2026-10-26T02:30:00Z'),
    createdAt: at('2026-10-26T02:30:00Z'),
    status: 'COMPLETED',
    quantityProduced: new Prisma.Decimal(25),
    enteredQuantity: null,
    enteredUnit: null,
    scrapQuantity: new Prisma.Decimal(0),
    scrapProngkolQty: new Prisma.Decimal(0.3),
    scrapDaunQty: new Prisma.Decimal(0),
    operatorId: 'op-3',
    shiftId: 'shift-1',
    operator: { name: 'Operator 3' },
    shift: { shiftName: 'Shift 1' },
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.productionShift.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.productVariant.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.productionPackagingConsumption.findMany).mockResolvedValue([] as never);
});

describe('loadKioskFocus', () => {
    it('reads no prices, costs or piece-rate pay for the public kiosk', async () => {
        vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(null as never);

        await loadKioskFocus('spk-1');

        const { select } = vi.mocked(prisma.productionOrder.findUnique).mock.calls[0][0] as { select: object };
        expect(JSON.stringify(select)).not.toMatch(/price|[cC]ost|piece|Earnings|dailyRate|salary/);
    });

    it('returns nothing for SPKs the kiosk cannot work on', async () => {
        vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({ status: 'COMPLETED', executions: [] } as never);

        expect(await loadKioskFocus('spk-1')).toBeNull();
    });

    it('builds the output history newest first, with packaging and affal per entry', async () => {
        vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
            id: 'spk-1',
            status: 'IN_PROGRESS',
            executions: [
                execution({ id: 'exec-new', createdAt: at('2026-10-26T04:00:00Z') }),
                execution({ id: 'exec-shell', endTime: null, quantityProduced: new Prisma.Decimal(0), scrapProngkolQty: new Prisma.Decimal(0) }),
                execution({ id: 'exec-void', status: 'VOIDED' }),
                execution({ id: 'exec-affal', quantityProduced: new Prisma.Decimal(0), createdAt: at('2026-10-26T03:00:00Z') }),
            ],
        } as never);
        vi.mocked(prisma.productionPackagingConsumption.findMany).mockResolvedValue([
            { executionId: 'exec-new', quantity: new Prisma.Decimal(240), unit: 'PCS', productVariant: { name: 'Etiket Merek A' } },
            { executionId: 'exec-new', quantity: new Prisma.Decimal(5), unit: 'PCS', productVariant: { name: 'Karung' } },
        ] as never);

        const focus = await loadKioskFocus('spk-1');

        expect(focus!.outputLogs.map((log) => log.id)).toEqual(['exec-new', 'exec-affal']);
        expect(focus!.outputLogs[0]).toMatchObject({
            operatorName: 'Operator 3',
            quantity: 25,
            scrapKg: 0.3,
            packaging: [
                { name: 'Etiket Merek A', quantity: 240, unit: 'PCS' },
                { name: 'Karung', quantity: 5, unit: 'PCS' },
            ],
        });
        expect(focus!.outputLogs[1].packaging).toEqual([]);
    });
});
