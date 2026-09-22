// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductionOrderDetail } from '../production-order-detail';
import type { ExtendedProductionOrder } from '@/components/production/order-detail/types';
vi.mock('@/actions/finance/finance', () => ({
    getOrderCosting: vi.fn(async () => ({
        success: true,
        data: { totalCost: 0 },
    })),
}));
vi.mock('../components/order-detail-header', () => ({
    OrderDetailHeader: () => <h1>SPK Test</h1>,
}));
vi.mock('../components/order-overview-tab', () => ({
    OrderOverviewTab: () => <p>Operational content</p>,
}));
vi.mock('../components/order-execution-tab', () => ({
    OrderExecutionTab: () => <p>Resource content</p>,
}));
vi.mock('../components/order-issues-tab', () => ({
    OrderIssuesTab: () => <p>Issues content</p>,
}));
vi.mock('../components/order-costing-tab', () => ({
    OrderCostingTab: () => <p>Cost content</p>,
}));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({
    EntityStatusTimeline: () => <p>Audit history</p>,
}));
vi.mock('@/components/production/OrderContextSummary', () => ({
    OrderContextSummary: () => <p>Customer context</p>,
}));
vi.mock('@/components/production/order-detail/OrderCustomersEditor', () => ({
    OrderCustomersEditor: () => <button>Edit customers</button>,
}));
const formData = {
    locations: [],
    operators: [],
    helpers: [],
    workShifts: [],
    machines: [],
    rawMaterials: [],
    customers: [],
};
function order(status: string) {
    return {
        id: 'test',
        status,
        issues: [{ status: 'OPEN' }],
        bom: { productVariant: {} },
        customerDestinations: [],
    } as unknown as ExtendedProductionOrder;
}
describe('SPK detail navigation', () => {
    it('keeps three tabs, defaults active production to resources, and retains accessible audit history', () => {
        const { container } = render(
            <ProductionOrderDetail
                order={order('IN_PROGRESS')}
                formData={formData}
            />,
        );
        expect(screen.getAllByRole('tab')).toHaveLength(3);
        expect(
            screen
                .getByRole('tab', { name: 'Bahan, tim & kualitas' })
                .getAttribute('aria-selected'),
        ).toBe('true');
        expect(screen.getByText('Resource content')).toBeTruthy();
        expect(container.querySelector('details')?.open).toBe(false);
        fireEvent.click(screen.getByText('Riwayat status SPK'));
        expect(container.querySelector('details')?.open).toBe(true);
        expect(screen.getByText('Audit history')).toBeTruthy();
    });
    it.each([
        'DRAFT',
        'RELEASED',
        'WAITING_MATERIAL',
        'COMPLETED',
        'CANCELLED',
    ])('defaults %s to Operasional', (status) => {
        render(
            <ProductionOrderDetail order={order(status)} formData={formData} />,
        );
        expect(
            screen
                .getByRole('tab', { name: 'Operasional' })
                .getAttribute('aria-selected'),
        ).toBe('true');
    });
    it('preserves the customer editor permission and terminal-status gate', () => {
        const { rerender } = render(
            <ProductionOrderDetail
                order={order('RELEASED')}
                formData={formData}
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Edit customers' }),
        ).toBeNull();
        rerender(
            <ProductionOrderDetail
                order={order('RELEASED')}
                formData={formData}
                canEditCustomers
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Edit customers' }),
        ).toBeTruthy();
        rerender(
            <ProductionOrderDetail
                order={order('COMPLETED')}
                formData={formData}
                canEditCustomers
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Edit customers' }),
        ).toBeNull();
    });
});
