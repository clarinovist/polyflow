// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
    replace: vi.fn(),
    push: vi.fn(),
    query: 'group=needs_action&page=2',
}));
vi.mock('next/navigation', () => ({
    useRouter: () => nav,
    usePathname: () => '/sales/deliveries',
    useSearchParams: () => new URLSearchParams(nav.query),
}));
import { DeliveryWorkbenchControls } from '../DeliveryWorkbenchControls';
import { DeliveryOrderTable } from '../DeliveryOrderTable';

const row = {
    id: 'do-1',
    orderNumber: 'SJ-SYNTHETIC-LONG-0001',
    deliveryDate: '2026-10-08T00:00:00Z',
    status: 'PENDING',
    salesOrderId: 'so-1',
    salesOrder: {
        orderNumber: 'SO-SYN-1',
        customer: { name: 'Customer Sintetis Panjang' },
    },
    sourceLocation: { name: 'Gudang Sintetis Panjang' },
};
const counts = {
    PENDING: 3,
    LOADING: 2,
    SHIPPED: 4,
    IN_TRANSIT: 1,
    ARRIVED: 1,
    DELIVERED: 6,
    RETURNED: 1,
    CANCELLED: 2,
};
const sharedProps = {
    statusCounts: counts,
    initialStartDate: '2026-10-01',
    initialEndDate: '2026-10-31',
    rows: [row],
    filterOptions: { customers: [], locations: [] },
};

describe('Delivery workbench', () => {
    it('keeps desktop/mobile primary links semantic and aligned to basePath', () => {
        render(<DeliveryOrderTable initialData={[row]} />);
        const links = screen.getAllByRole('link', {
            name: 'Lihat detail SJ-SYNTHETIC-LONG-0001',
        });
        expect(links).toHaveLength(2);
        for (const link of links) {
            expect(link.getAttribute('href')).toBe('/sales/deliveries/do-1');
        }
        expect(
            within(
                screen.getByRole('list', {
                    name: /Daftar Surat Jalan aktif mobile/,
                }),
            ).getByText('Customer Sintetis Panjang'),
        ).toBeTruthy();
    });

    it('switches grouped/raw status exclusively and resets page', () => {
        nav.query = 'group=needs_action&page=2';
        nav.replace.mockReset();
        render(
            <DeliveryWorkbenchControls
                {...sharedProps}
                group="needs_action"
                meta={{
                    page: 2,
                    pageSize: 50,
                    total: 20,
                    totalPages: 1,
                    sort: 'priority',
                    direction: 'desc',
                }}
            />,
        );
        fireEvent.change(screen.getByLabelText('Status detail'), {
            target: { value: 'DELIVERED' },
        });
        expect(nav.replace).toHaveBeenLastCalledWith(
            '/sales/deliveries?status=DELIVERED',
            { scroll: false },
        );
        fireEvent.click(screen.getByRole('button', { name: /Pengecualian/ }));
        expect(nav.replace).toHaveBeenLastCalledWith(
            '/sales/deliveries?group=exceptions',
            { scroll: false },
        );
    });

    it('searches explicitly and server pagination preserves URL state', () => {
        nav.query = 'q=old';
        nav.replace.mockReset();
        render(
            <DeliveryWorkbenchControls
                {...sharedProps}
                initialSearch="old"
                meta={{
                    page: 1,
                    pageSize: 50,
                    total: 51,
                    totalPages: 2,
                    sort: 'priority',
                    direction: 'desc',
                }}
            />,
        );
        fireEvent.change(screen.getByLabelText('Cari Surat Jalan'), {
            target: { value: 'SJ-NEW' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cari' }));
        expect(nav.replace).toHaveBeenLastCalledWith(
            '/sales/deliveries?q=SJ-NEW',
            { scroll: false },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Halaman berikutnya' }),
        );
        expect(nav.replace).toHaveBeenLastCalledWith(
            '/sales/deliveries?q=old&page=2',
            { scroll: false },
        );
    });
});
