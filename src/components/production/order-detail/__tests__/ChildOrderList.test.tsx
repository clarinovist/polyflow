// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChildOrderList } from '../ChildOrderList';
import { getRealtimeStock } from '@/actions/inventory/inventory';
import type { ExtendedProductionOrder } from '../types';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/production/production', () => ({
    createChildProductionOrder: vi.fn(),
}));

vi.mock('@/actions/inventory/inventory', () => ({
    getRealtimeStock: vi.fn(),
}));

const WIP_LOCATION = {
    id: 'loc-wip',
    name: 'Gudang WIP & Intermediate',
    slug: 'gudang-wip-intermediate',
    locationPurpose: 'WIP',
};

const LOCATIONS = [WIP_LOCATION] as any;

function buildOrder(
    overrides: Partial<ExtendedProductionOrder> = {},
): ExtendedProductionOrder {
    return {
        id: 'po-1',
        orderNumber: 'WO-260810-012',
        plannedQuantity: 5000,
        actualQuantity: 549.8,
        bom: { category: 'EXTRUSION' },
        plannedMaterials: [
            {
                id: 'pm-1',
                productVariantId: 'var-wip-1',
                quantity: 5000,
                productVariant: {
                    id: 'var-wip-1',
                    name: 'Campuran Rafia Hitam KW',
                    skuCode: 'WIP000007',
                    primaryUnit: 'KG',
                    product: { productType: 'WIP' },
                },
            },
        ],
        materialIssues: [],
        childOrders: [],
        ...overrides,
    } as unknown as ExtendedProductionOrder;
}

describe('ChildOrderList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 0,
        });
    });

    it('regression WO-260810-012: does not double-count an explicit MaterialIssue with the backflush estimate', async () => {
        const order = buildOrder({
            materialIssues: [
                {
                    id: 'mi-1',
                    productVariantId: 'var-wip-1',
                    quantity: 576,
                    status: 'ISSUED',
                },
            ],
        } as any);

        render(<ChildOrderList order={order} locations={LOCATIONS} />);

        // Correct shortage: 5000 planned - 576 issued = 4424 (matches the
        // "Selisih -4424.00" badge shown in order-materials-tab.tsx). The old
        // buggy code additionally subtracted a 549.8 backflush estimate on
        // top of the 576 already-issued qty, showing 3874.20 instead.
        expect(await screen.findByText(/4424\.00/)).toBeTruthy();
        expect(screen.queryByText(/3874\.20/)).toBeNull();
    });

    it('still applies the backflush estimate when there is no explicit MaterialIssue', async () => {
        const order = buildOrder({ materialIssues: [] } as any);

        render(<ChildOrderList order={order} locations={LOCATIONS} />);

        // backflush = (549.8 / 5000) * 5000 = 549.8 → shortage = 5000 - 549.8 = 4450.20
        expect(await screen.findByText(/4450\.20/)).toBeTruthy();
    });

    it('shows an "available stock" hint and de-emphasizes "Buat SPK" when stock fully covers the shortage', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 5000,
        });
        const order = buildOrder({
            materialIssues: [
                {
                    id: 'mi-1',
                    productVariantId: 'var-wip-1',
                    quantity: 576,
                    status: 'ISSUED',
                },
            ],
        } as any);

        render(<ChildOrderList order={order} locations={LOCATIONS} />);

        await waitFor(() =>
            expect(getRealtimeStock).toHaveBeenCalledWith(
                'loc-wip',
                'var-wip-1',
            ),
        );
        expect(await screen.findByText(/Stok cukup/i)).toBeTruthy();
        const createButton = await screen.findByRole('button', {
            name: /Buat SPK/i,
        });
        expect(createButton.className).toContain('opacity-50');
    });

    it('shows a "partial stock" hint when stock only partially covers the shortage', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 2897.2,
        });
        const order = buildOrder({
            materialIssues: [
                {
                    id: 'mi-1',
                    productVariantId: 'var-wip-1',
                    quantity: 576,
                    status: 'ISSUED',
                },
            ],
        } as any);

        render(<ChildOrderList order={order} locations={LOCATIONS} />);

        expect(await screen.findByText(/Stok sebagian/i)).toBeTruthy();
        expect(await screen.findByText(/2897\.20/)).toBeTruthy();
    });

    it('ignores raw-material planned lines and renders nothing when there is no shortage or child order', () => {
        const order = buildOrder({
            plannedMaterials: [
                {
                    id: 'pm-rm',
                    productVariantId: 'var-rm-1',
                    quantity: 100,
                    productVariant: {
                        id: 'var-rm-1',
                        name: 'Biji Plastik',
                        skuCode: 'RM001',
                        primaryUnit: 'KG',
                        product: { productType: 'RAW_MATERIAL' },
                    },
                },
            ],
            materialIssues: [],
            childOrders: [],
        } as any);

        const { container } = render(
            <ChildOrderList order={order} locations={LOCATIONS} />,
        );

        expect(container.firstChild).toBeNull();
    });
});
