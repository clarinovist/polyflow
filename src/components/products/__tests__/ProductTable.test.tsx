// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { archiveVariant, deleteVariant, push, refresh, unarchiveVariant } =
    vi.hoisted(() => ({
        archiveVariant: vi.fn(),
        deleteVariant: vi.fn(),
        push: vi.fn(),
        refresh: vi.fn(),
        unarchiveVariant: vi.fn(),
    }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, refresh }),
}));
vi.mock('@/actions/product', () => ({
    archiveVariant,
    deleteVariant,
    unarchiveVariant,
}));
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import { ProductTable } from '../ProductTable';

const catalogPage = {
    items: [
        {
            id: 'variant-active',
            productId: 'product-1',
            productName: 'Rafia',
            productType: 'FINISHED_GOOD' as const,
            name: 'Rafia Merah',
            skuCode: 'FGRAF001',
            primaryUnit: 'KG' as const,
            salesUnit: null,
            conversionFactor: 1,
            price: 15000,
            standardCost: 9000,
            buyPrice: 10000,
            minStockAlert: 2,
            currentCost: 8000,
            currentStockValue: 40000,
            stock: 5,
            archivedAt: null,
            inventoryCount: 1,
        },
        {
            id: 'variant-archived',
            productId: 'product-2',
            productName: 'Tali',
            productType: 'FINISHED_GOOD' as const,
            name: 'Tali Biru',
            skuCode: 'FGTAL001',
            primaryUnit: 'KG' as const,
            salesUnit: null,
            conversionFactor: 1,
            price: 18000,
            standardCost: 11000,
            buyPrice: 12000,
            minStockAlert: null,
            currentCost: 10000,
            currentStockValue: 30000,
            stock: 3,
            archivedAt: '2026-09-01T00:00:00.000Z',
            inventoryCount: 1,
        },
    ],
    page: 1,
    pageSize: 50,
    total: 102,
    pageCount: 3,
    query: {
        search: '',
        includeArchived: true,
        sort: 'name' as const,
        direction: 'asc' as const,
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    archiveVariant.mockResolvedValue({ success: true });
    deleteVariant.mockResolvedValue({ success: true });
    unarchiveVariant.mockResolvedValue({ success: true });
});

describe('ProductTable', () => {
    it('renders the current page with bounded sticky and accessible table controls', () => {
        render(<ProductTable catalogPage={catalogPage} showPrices />);

        expect(screen.getByText('Daftar varian produk')).toBeTruthy();
        expect(screen.getByText('Menampilkan 1–50 dari 102 varian')).toBeTruthy();
        expect(screen.getByText('Halaman 1 dari 3')).toBeTruthy();
        const tableScroller = screen.getByTestId('product-catalog-scroll');
        expect(tableScroller.getAttribute('style')).toContain('max-height');
        expect(tableScroller.getAttribute('role')).toBe('region');
        expect(tableScroller.getAttribute('aria-label')).toMatch(
            /geser horizontal/i,
        );
        expect(tableScroller.getAttribute('tabindex')).toBe('0');
        expect(tableScroller.className).toContain('max-w-full');

        const nameHeader = screen.getByRole('columnheader', {
            name: /Item Katalog/,
        });
        expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
        expect(
            screen.getByRole('columnheader', { name: /Stok/ }).getAttribute('aria-sort'),
        ).toBe('none');

        expect(screen.getByRole('button', { name: 'Informasi stok' })).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Informasi biaya saat ini' }),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Informasi biaya standar' }),
        ).toBeTruthy();

        const edit = screen.getByRole('button', {
            name: 'Edit Rafia Merah (FGRAF001)',
        });
        expect(edit).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: 'Arsipkan Rafia Merah (FGRAF001)',
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: 'Pulihkan Tali Biru (FGTAL001)',
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: 'Hapus Rafia Merah (FGRAF001)',
            }),
        ).toBeTruthy();
        expect(edit.parentElement?.className).toContain('opacity-100');
        expect(edit.className).toContain('h-11');
        expect(edit.className).toContain('sm:h-8');
        expect(screen.getByText('5.00')).toBeTruthy();
        expect(screen.getByText(/Rp\s*8\.000/)).toBeTruthy();
    });

    it('keeps edit, archive, restore, and delete actions wired', async () => {
        render(<ProductTable catalogPage={catalogPage} showPrices />);

        fireEvent.click(
            screen.getByRole('button', { name: 'Edit Rafia Merah (FGRAF001)' }),
        );
        expect(push).toHaveBeenCalledWith('/dashboard/products/product-1/edit');

        fireEvent.click(
            screen.getByRole('button', { name: 'Pulihkan Tali Biru (FGTAL001)' }),
        );
        await waitFor(() => expect(unarchiveVariant).toHaveBeenCalledWith('variant-archived'));

        fireEvent.click(
            screen.getByRole('button', { name: 'Arsipkan Rafia Merah (FGRAF001)' }),
        );
        const archiveDialog = await screen.findByRole('dialog');
        fireEvent.click(within(archiveDialog).getByRole('button', { name: 'Arsipkan' }));
        await waitFor(() => expect(archiveVariant).toHaveBeenCalledWith('variant-active'));

        fireEvent.click(
            screen.getByRole('button', { name: 'Hapus Rafia Merah (FGRAF001)' }),
        );
        const deleteDialog = await screen.findByRole('dialog');
        fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Hapus SKU' }));
        await waitFor(() => expect(deleteVariant).toHaveBeenCalledWith('variant-active'));
    });

    it('does not render price fields when price access is denied', () => {
        render(<ProductTable catalogPage={catalogPage} showPrices={false} />);

        expect(
            screen.queryByRole('columnheader', { name: /Biaya Saat Ini/i }),
        ).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Informasi biaya saat ini' }),
        ).toBeNull();
        expect(screen.queryByText(/Rp\s*8\.000/)).toBeNull();
        expect(screen.queryByText(/Rp\s*9\.000/)).toBeNull();
        expect(screen.queryByText(/Rp\s*10\.000/)).toBeNull();
        expect(screen.queryByText(/Rp\s*15\.000/)).toBeNull();
    });

    it('uses URL navigation for server-side search, sorting, page size, and paging', () => {
        render(<ProductTable catalogPage={catalogPage} />);

        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'merah' },
        });
        fireEvent.submit(screen.getByRole('search'));
        expect(push).toHaveBeenCalledWith(
            expect.stringContaining('q=merah'),
        );

        fireEvent.click(screen.getByRole('button', { name: /Urutkan berdasarkan Item Katalog/ }));
        expect(push).toHaveBeenCalledWith(
            expect.stringMatching(/sort=name.*direction=desc|direction=desc.*sort=name/),
        );

        fireEvent.change(screen.getByLabelText('Baris per halaman'), {
            target: { value: '100' },
        });
        expect(push).toHaveBeenCalledWith(expect.stringContaining('pageSize=100'));

        fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
        expect(push).toHaveBeenCalledWith(expect.stringContaining('page=2'));
    });
});
