// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getOrders: vi.fn(),
    getFormData: vi.fn(),
    getPendingRequests: vi.fn(),
}));

vi.mock('@/actions/production/production-orders', () => ({
    getProductionOrders: mocks.getOrders,
}));
vi.mock('@/actions/production/production', () => ({
    getProductionFormData: mocks.getFormData,
    getPendingAdditionalMaterialRequests: mocks.getPendingRequests,
}));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (value: unknown) => value }));
vi.mock('../../WarehouseRefreshWrapper', () => ({
    default: (props: {
        initialOrderId?: string;
        initialOrders: Array<{ id: string }>;
    }) => (
        <div
            data-testid="materials-queue"
            data-order-id={props.initialOrderId}
            data-orders={props.initialOrders.map((order) => order.id).join(',')}
        />
    ),
}));

import WarehouseMaterialsPage from '../page';

describe('WarehouseMaterialsPage', () => {
    beforeEach(() => {
        mocks.getOrders.mockResolvedValue([
            { id: 'spk-1', status: 'WAITING_MATERIAL' },
            { id: 'spk-done', status: 'COMPLETED' },
        ]);
        mocks.getFormData.mockResolvedValue({ success: false });
        mocks.getPendingRequests.mockResolvedValue({ success: true, data: [] });
    });

    it('passes an active requested SPK to the queue for focus', async () => {
        render(
            await WarehouseMaterialsPage({
                searchParams: Promise.resolve({ orderId: 'spk-1' }),
            }),
        );

        expect(screen.getByTestId('materials-queue').getAttribute('data-order-id')).toBe(
            'spk-1',
        );
    });

    it('keeps a completed SPK visible while its additional-material request is pending', async () => {
        mocks.getPendingRequests.mockResolvedValue({
            success: true,
            data: [{ id: 'request-1', productionOrderId: 'spk-done' }],
        });

        render(
            await WarehouseMaterialsPage({
                searchParams: Promise.resolve({ orderId: 'spk-done' }),
            }),
        );

        expect(screen.getByTestId('materials-queue').getAttribute('data-orders')).toContain(
            'spk-done',
        );
        expect(screen.getByTestId('materials-queue').getAttribute('data-order-id')).toBe(
            'spk-done',
        );
    });

    it('falls back safely when the requested order is outside the active queue', async () => {
        render(
            await WarehouseMaterialsPage({
                searchParams: Promise.resolve({ orderId: 'spk-done' }),
            }),
        );

        expect(
            screen.getByTestId('materials-queue').getAttribute('data-order-id'),
        ).toBeNull();
    });
});
