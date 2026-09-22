// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderExecutionTab } from '../order-execution-tab';
import type { ExtendedProductionOrder } from '@/components/production/order-detail/types';
const child = vi.hoisted(() => vi.fn());
vi.mock('@/components/production/order-detail/ChildOrderList', () => ({
    ChildOrderList: (props: unknown) => {
        child(props);
        return <p>Child orders</p>;
    },
}));
vi.mock(
    '@/components/production/order-detail/BatchIssueMaterialDialog',
    () => ({
        BatchIssueMaterialDialog: () => <button>Transfer materials</button>,
    }),
);
vi.mock('@/components/production/order-detail/ManualProcurementDialog', () => ({
    ManualProcurementDialog: () => <button>Procurement</button>,
}));
vi.mock('@/components/production/order-detail/RecordScrapDialog', () => ({
    RecordScrapDialog: () => null,
}));
vi.mock('@/components/production/order-detail/DeleteScrapButton', () => ({
    DeleteScrapButton: () => null,
}));
vi.mock('@/components/production/order-detail/RecordQCDialog', () => ({
    RecordQCDialog: () => null,
}));
vi.mock('@/components/production/ShiftManager', () => ({
    ShiftManager: () => <p>Shifts</p>,
}));
const locations = [{ id: 'source', name: 'Source test' }];
const formData = {
    locations,
    operators: [],
    helpers: [],
    workShifts: [],
    machines: [],
    rawMaterials: [],
} as never;
const order = {
    id: 'test',
    status: 'IN_PROGRESS',
    materialConsumptionMode: 'TRANSFER',
    bom: { category: 'PACKING' },
    plannedMaterials: [],
    materialIssues: [],
    shifts: [],
    scrapRecords: [],
    inspections: [],
} as unknown as ExtendedProductionOrder;
describe('resource layout', () => {
    it('does not hide waiting-material instructions when direct-mode details move to help', async () => {
        vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
        render(<OrderExecutionTab order={{ ...order, status: 'WAITING_MATERIAL', materialConsumptionMode: 'DIRECT' }} formData={formData} />);
        expect(screen.getByText(/Lengkapi stok di gudang asal/)).toBeTruthy();
        expect(screen.queryByText(/Tidak perlu transfer atau issue manual/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Info pemakaian langsung' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('Tidak perlu transfer atau issue manual');
    });
    it('passes the real location set to child-order stock resolution and preserves sections', () => {
        render(<OrderExecutionTab order={order} formData={formData} />);
        expect(child).toHaveBeenCalledWith(
            expect.objectContaining({ locations }),
        );
        expect(
            screen
                .getByRole('link', { name: 'Tim & shift' })
                .getAttribute('href'),
        ).toBe('#spk-team');
        expect(
            screen.getByRole('button', { name: 'Transfer materials' }),
        ).toBeTruthy();
    });
    it('does not offer transfer or procurement for DIRECT', () => {
        render(
            <OrderExecutionTab
                order={{ ...order, materialConsumptionMode: 'DIRECT' }}
                formData={formData}
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Transfer materials' }),
        ).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Procurement' }),
        ).toBeNull();
        expect(screen.getByText('Langsung per bahan')).toBeTruthy();
    });
});
