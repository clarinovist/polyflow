// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { PurchaseOrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/purchasing/orders',
    useRouter: () => ({ push }),
}));

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'PROCUREMENT' } } }) }));
vi.mock('@/actions/purchasing/close-purchase-order', () => ({ closePurchaseOrder: vi.fn() }));

import { PurchaseOrderTable } from '../PurchaseOrderTable';

const orders = [
    {
        id: 'po-51',
        orderNumber: 'PO-2026-0051',
        orderDate: new Date('2026-09-12T00:00:00.000Z'),
        expectedDate: null,
        status: PurchaseOrderStatus.SENT,
        totalAmount: 125000,
        supplier: { name: 'Supplier Page Two', code: 'SUP-2' },
        _count: { items: 2 },
    },
];

const pagination = {
    page: 2,
    pageSize: 50,
    totalCount: 101,
    totalPages: 3,
};

describe('PurchaseOrderTable paged list', () => {
    it('offers close only for partial orders and labels CLOSED as Ditutup', () => {
        render(<PurchaseOrderTable orders={[
            { ...orders[0], id: 'partial', orderNumber: 'PO-PARTIAL', status: PurchaseOrderStatus.PARTIAL_RECEIVED },
            { ...orders[0], id: 'closed', orderNumber: 'PO-CLOSED', status: PurchaseOrderStatus.CLOSED },
            ...orders,
        ]} />);
        expect(screen.getAllByRole('button', { name: 'Tutup PO PO-PARTIAL' })).toHaveLength(2);
        expect(within(screen.getByRole('list', { name: 'Daftar PO mobile' })).getByRole('button', { name: 'Tutup PO PO-PARTIAL' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Tutup PO PO-CLOSED' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Tutup PO PO-2026-0051' })).toBeNull();
        expect(screen.getAllByText('Ditutup').length).toBeGreaterThan(0);
    });
    beforeEach(() => {
        push.mockReset();
        window.history.replaceState({}, '', '/purchasing/orders?page=2&pageSize=50&status=SENT');
    });

    it('renders only the supplied page with accessible bounded-table semantics', () => {
        render(
            <PurchaseOrderTable
                orders={orders}
                pagination={pagination}
                initialStatus="SENT"
                sort="orderDate"
                direction="desc"
            />,
        );

        const table = screen.getByRole('table', {
            name: 'Daftar order pembelian',
        });
        expect(within(table).getByText('PO-2026-0051')).toBeTruthy();
        expect(screen.getByText('Menampilkan 1 dari 101 order')).toBeTruthy();
        expect(
            screen.getByRole('navigation', { name: 'Paginasi order pembelian' }),
        ).toBeTruthy();
        expect(
            screen.getByRole('columnheader', { name: 'No. PO' }).getAttribute(
                'aria-sort',
            ),
        ).toBe('descending');
        expect(
            within(table).getByRole('button', {
                name: 'Urutkan berdasarkan No. PO',
            }),
        ).toBeTruthy();
        const tableScroller = table.closest('[data-sticky-table="true"]');
        expect(tableScroller).toBeTruthy();
        expect(tableScroller?.getAttribute('role')).toBe('region');
        expect(tableScroller?.getAttribute('aria-label')).toMatch(
            /geser horizontal/i,
        );
        expect(tableScroller?.getAttribute('tabindex')).toBe('0');
        expect(screen.getByLabelText('Cari order pembelian').className).toContain(
            'w-full',
        );
    });

    it('updates URL-backed page, page size, search, status, and sorting controls', () => {
        render(
            <PurchaseOrderTable
                orders={orders}
                pagination={pagination}
                initialStatus="SENT"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
        expect(push).toHaveBeenLastCalledWith(
            '/purchasing/orders?page=3&pageSize=50&status=SENT',
        );

        fireEvent.change(screen.getByLabelText('Jumlah baris per halaman'), {
            target: { value: '100' },
        });
        expect(push).toHaveBeenLastCalledWith(
            '/purchasing/orders?page=1&pageSize=100&status=SENT',
        );

        fireEvent.change(screen.getByLabelText('Cari order pembelian'), {
            target: { value: 'Supplier Baru' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan filter' }));
        expect(push).toHaveBeenLastCalledWith(
            '/purchasing/orders?page=1&pageSize=50&status=SENT&search=Supplier+Baru',
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Urutkan berdasarkan No. PO' }),
        );
        expect(push).toHaveBeenLastCalledWith(
            '/purchasing/orders?page=1&pageSize=50&status=SENT&sort=orderDate&direction=asc',
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Urutkan berdasarkan Supplier' }),
        );
        expect(push).toHaveBeenLastCalledWith(
            '/purchasing/orders?page=1&pageSize=50&status=SENT&sort=supplier&direction=desc',
        );
    });
});
