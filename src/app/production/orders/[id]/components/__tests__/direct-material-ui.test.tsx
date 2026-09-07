// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderDetailHeader } from '../order-detail-header';
import WarehouseRefreshWrapper from '@/app/warehouse/WarehouseRefreshWrapper';
import type { ExtendedProductionOrder } from '@/components/production/order-detail/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../order-status-actions', () => ({ OrderStatusActions: () => null }));
vi.mock('@/components/production/ReassignMachineButton', () => ({
    ReassignMachineButton: () => null,
}));
vi.mock('@/components/production/ReassignOutputLocationButton', () => ({
    ReassignConsumptionLocationButton: () => (
        <button>Ubah pemakaian tunggal</button>
    ),
    ReassignOutputLocationButton: () => null,
}));
vi.mock(
    '@/components/production/order-detail/BatchIssueMaterialDialog',
    () => ({ BatchIssueMaterialDialog: () => null }),
);
vi.mock(
    '@/components/production/order-detail/AdHocMaterialUsageDialog',
    () => ({ AdHocMaterialUsageDialog: () => null }),
);
vi.mock('@/components/warehouse/ConsolidatedIssueDialog', () => ({
    ConsolidatedIssueDialog: () => null,
}));
const order = {
    id: 'po',
    orderNumber: 'WO-DIRECT',
    status: 'DRAFT',
    priority: 'NORMAL',
    plannedQuantity: 10,
    actualQuantity: 0,
    plannedStartDate: new Date(),
    plannedMaterials: [],
    materialIssues: [],
    materialConsumptionMode: 'DIRECT',
    locationId: 'fg',
    location: { id: 'fg', name: 'Gudang Hasil' },
    bom: {
        name: 'Resep',
        category: 'PACKING',
        productVariant: {
            name: 'Barang',
            primaryUnit: 'KG',
            product: { name: 'Produk' },
        },
    },
} as unknown as ExtendedProductionOrder;
const formData = {
    locations: [],
    operators: [],
    helpers: [],
    workShifts: [],
    machines: [],
    rawMaterials: [],
};
describe('direct order presentation', () => {
    it('labels direct consumption without offering a single consumption warehouse editor', () => {
        render(<OrderDetailHeader order={order} formData={formData} />);
        expect(screen.getByText('Langsung per bahan')).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: 'Ubah pemakaian tunggal' }),
        ).toBeNull();
    });
    it('does not put direct orders into the manual material-issue queue', () => {
        render(
            <WarehouseRefreshWrapper
                initialOrders={[order]}
                formData={formData}
            />,
        );
        expect(screen.queryByText('WO-DIRECT')).toBeNull();
    });
});