// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    customers: vi.fn(),
    prices: vi.fn(),
    products: vi.fn(),
    canManage: vi.fn(),
    client: vi.fn(),
}));

vi.mock('@/actions/sales/customer', () => ({ getCustomers: mocks.customers }));
vi.mock('@/actions/sales/price-list', () => ({
    listPricesByProductAction: mocks.prices,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { productVariant: { findMany: mocks.products } },
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn(),
    canManageSalesPricing: mocks.canManage,
}));
vi.mock('@/components/sales/price-list/PriceListClient', () => ({
    PriceListClient: (props: unknown) => {
        mocks.client(props);
        return <div data-testid="price-list" />;
    },
}));

import PriceListPage from '../page';

const page = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.customers.mockResolvedValue({ success: true, data: [] });
    mocks.prices.mockResolvedValue({ success: true, data: page });
    mocks.products.mockResolvedValue([]);
    mocks.canManage.mockResolvedValue(true);
});

describe('price list page workbench wiring', () => {
    it('passes the server capability and successful data to the client', async () => {
        render(await PriceListPage());
        expect(screen.getByTestId('price-list')).toBeTruthy();
        expect(mocks.client).toHaveBeenCalledWith(
            expect.objectContaining({
                initialPrices: page,
                canManage: true,
                priceError: undefined,
                customerOptionsError: undefined,
                productOptionsError: undefined,
            }),
        );
    });

    it('keeps a main query failure distinct from an empty result', async () => {
        mocks.prices.mockResolvedValue({
            success: false,
            error: 'DB harga gagal',
            code: 'INTERNAL_ERROR',
        });
        render(await PriceListPage());
        expect(mocks.client).toHaveBeenCalledWith(
            expect.objectContaining({
                initialPrices: expect.objectContaining({
                    data: [],
                    total: 0,
                    totalPages: 0,
                }),
                priceError: 'DB harga gagal',
            }),
        );
    });

    it('marks customer/product option failures independently while preserving the main register', async () => {
        mocks.customers.mockResolvedValue({
            success: false,
            error: 'customer down',
            code: 'INTERNAL_ERROR',
        });
        mocks.products.mockRejectedValue(new Error('product down'));
        render(await PriceListPage());
        expect(mocks.client).toHaveBeenCalledWith(
            expect.objectContaining({
                initialPrices: page,
                customerOptionsError: 'customer down',
                productOptionsError: 'Gagal memuat opsi produk.',
            }),
        );
    });
});
