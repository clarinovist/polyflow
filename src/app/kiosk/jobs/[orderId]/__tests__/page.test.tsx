// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findOrder: vi.fn(),
    findMovements: vi.fn(),
    findShifts: vi.fn(),
    findMaterials: vi.fn(),
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
    },
}));
vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: (...args: never[]) => unknown) => fn,
}));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (value: unknown) => value }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('../KioskJobFocus', () => ({
    default: (props: { materials: unknown[] }) => (
        <div data-testid="kiosk-focus" data-materials={props.materials.length} />
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

    it.each(['COMPLETED', 'CANCELLED'])('does not expose %s orders through a stale kiosk URL', async (status) => {
        mocks.findOrder.mockResolvedValue({ ...baseOrder, status });

        await expect(
            KioskFocusPage({ params: Promise.resolve({ orderId: 'po-1' }) }),
        ).rejects.toThrow('NEXT_NOT_FOUND');
        expect(mocks.findMaterials).not.toHaveBeenCalled();
    });
});
