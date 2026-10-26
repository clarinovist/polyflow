// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findOrder: vi.fn(),
    findMovements: vi.fn(),
    findShifts: vi.fn(),
    findMaterials: vi.fn(),
    findConsumption: vi.fn(),
    notFound: vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findUnique: mocks.findOrder },
        stockMovement: { findMany: mocks.findMovements },
        productionShift: { findMany: mocks.findShifts },
        productVariant: { findMany: mocks.findMaterials },
        productionPackagingConsumption: { findMany: mocks.findConsumption },
    },
}));
vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: (...args: never[]) => unknown) => fn,
}));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (value: unknown) => value }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('../KioskJobFocus', () => ({
    default: (props: {
        materials: unknown[];
        order: { outputLogs: { id: string; quantity: number }[] };
    }) => (
        <div
            data-testid="kiosk-focus"
            data-materials={props.materials.length}
            data-logs={props.order.outputLogs
                .map((log) => `${log.id}:${log.quantity}`)
                .join(',')}
        />
    ),
}));

import KioskFocusPage from '../page';

const baseOrder = {
    id: 'po-1',
    orderNumber: 'WO-001',
    status: 'IN_PROGRESS',
    bom: { productVariant: { id: 'output-1' }, items: [] },
    executions: [],
};

describe('KioskFocusPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.findMovements.mockResolvedValue([]);
        mocks.findShifts.mockResolvedValue([]);
        mocks.findConsumption.mockResolvedValue([]);
        mocks.findMaterials.mockResolvedValue([
            {
                id: 'material-1',
                name: 'Pelembab',
                skuCode: 'RM-PLB-01',
                primaryUnit: 'KG',
                product: { productType: 'RAW_MATERIAL' },
            },
        ]);
    });

    it('loads issuable materials for an active kiosk SPK', async () => {
        mocks.findOrder.mockResolvedValue(baseOrder);

        render(
            await KioskFocusPage({
                params: Promise.resolve({ orderId: 'po-1' }),
            }),
        );

        expect(screen.getByTestId('kiosk-focus').getAttribute('data-materials')).toBe('1');
        expect(mocks.findMaterials).toHaveBeenCalled();
    });

    it('builds recent output logs from completed executions, newest first', async () => {
        mocks.findOrder.mockResolvedValue({
            ...baseOrder,
            executions: [
                { id: 'running', status: 'COMPLETED', endTime: null, quantityProduced: 0, createdAt: new Date('2026-10-26T01:00:00Z') },
                { id: 'early', status: 'COMPLETED', endTime: new Date('2026-10-26T02:00:00Z'), quantityProduced: 30, createdAt: new Date('2026-10-26T02:00:00Z') },
                { id: 'voided', status: 'VOIDED', endTime: new Date('2026-10-26T03:00:00Z'), quantityProduced: 5, createdAt: new Date('2026-10-26T03:00:00Z') },
                { id: 'scrap-only', status: 'COMPLETED', endTime: new Date('2026-10-26T04:00:00Z'), quantityProduced: 0, createdAt: new Date('2026-10-26T04:00:00Z') },
                { id: 'late', status: 'COMPLETED', endTime: new Date('2026-10-26T05:00:00Z'), quantityProduced: 25, createdAt: new Date('2026-10-26T05:00:00Z') },
            ],
        });

        render(await KioskFocusPage({ params: Promise.resolve({ orderId: 'po-1' }) }));

        expect(screen.getByTestId('kiosk-focus').getAttribute('data-logs')).toBe('late:25,early:30');
        expect(mocks.findMovements).not.toHaveBeenCalled();
    });

    it.each(['COMPLETED', 'CANCELLED'])('does not expose %s orders through a stale kiosk URL', async (status) => {
        mocks.findOrder.mockResolvedValue({ ...baseOrder, status });

        await expect(
            KioskFocusPage({ params: Promise.resolve({ orderId: 'po-1' }) }),
        ).rejects.toThrow('NEXT_NOT_FOUND');
        expect(mocks.findMaterials).not.toHaveBeenCalled();
    });
});
