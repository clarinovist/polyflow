// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { canViewPrices, getProductCatalogPage, productTable } = vi.hoisted(() => ({
    canViewPrices: vi.fn(),
    getProductCatalogPage: vi.fn(),
    productTable: vi.fn(),
}));

vi.mock('@/actions/product', () => ({ getProductCatalogPage }));
vi.mock('@/actions/admin/permissions', () => ({ canViewPrices }));
vi.mock('@/components/products/ProductTable', () => ({
    ProductTable: (props: unknown) => {
        productTable(props);
        return <div data-testid="product-table" />;
    },
}));
vi.mock('@/components/products/ProductGlossary', () => ({
    ProductGlossary: () => null,
}));
vi.mock('@/components/products/ImportDialog', () => ({ ImportDialog: () => null }));

import ProductsPage from '../page';

const page = {
    items: [{ id: 'current-page-only', skuCode: 'SKU-051' }],
    page: 2,
    pageSize: 50,
    total: 51,
    pageCount: 2,
    query: {
        search: 'rafia',
        type: 'RAW_MATERIAL',
        includeArchived: true,
        sort: 'stock',
        direction: 'desc',
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    getProductCatalogPage.mockResolvedValue({ success: true, data: page });
    canViewPrices.mockResolvedValue({ success: true, data: true });
});

describe('ProductsPage', () => {
    it('loads the dedicated catalog page from validated URL state', async () => {
        render(
            await ProductsPage({
                searchParams: Promise.resolve({
                    q: 'rafia',
                    type: 'RAW_MATERIAL',
                    archived: '1',
                    page: '2',
                    pageSize: '50',
                    sort: 'stock',
                    direction: 'desc',
                }),
            }),
        );

        expect(getProductCatalogPage).toHaveBeenCalledWith({
            search: 'rafia',
            type: 'RAW_MATERIAL',
            includeArchived: true,
            page: 2,
            pageSize: 50,
            sort: 'stock',
            direction: 'desc',
        });
        expect(productTable).toHaveBeenCalledWith({
            catalogPage: page,
            showPrices: true,
        });
        expect(
            screen.getByRole('region', { name: 'Filter tipe produk' }),
        ).toBeTruthy();
        const activeFilter = screen.getByRole('tab', { name: 'Bahan Baku' });
        expect(activeFilter.tagName).toBe('A');
        expect(activeFilter.getAttribute('href')).toBe(
            '/dashboard/products?type=RAW_MATERIAL',
        );
    });

    it('keeps price visibility denied when the permission check fails', async () => {
        canViewPrices.mockResolvedValue({
            success: false,
            error: 'Forbidden',
        });

        render(
            await ProductsPage({
                searchParams: Promise.resolve({}),
            }),
        );

        expect(productTable).toHaveBeenCalledWith({
            catalogPage: page,
            showPrices: false,
        });
    });

    it('fails visibly instead of disguising a catalog query error as empty data', async () => {
        getProductCatalogPage.mockResolvedValue({
            success: false,
            error: 'Database unavailable',
        });

        await expect(
            ProductsPage({ searchParams: Promise.resolve({}) }),
        ).rejects.toThrow('Gagal memuat katalog produk');
        expect(productTable).not.toHaveBeenCalled();
    });
});
