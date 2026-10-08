// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    toast: vi.fn(),
}));

vi.mock('@/actions/sales/price-list', () => ({
    listPricesByProductAction: mocks.list,
    upsertSinglePriceAction: vi.fn(),
    previewBulkAdjustPricesAction: vi.fn(),
    applyBulkAdjustPricesAction: vi.fn(),
}));
vi.mock('sonner', () => ({
    toast: { error: mocks.toast, success: vi.fn() },
}));
vi.mock('@/components/sales/price-list/BulkAdjustDialog', () => ({
    BulkAdjustDialog: () => <div data-testid="bulk-dialog" />,
}));

import {
    PriceListClient,
    type PriceListResult,
} from '../PriceListClient';

const prices: PriceListResult = {
    data: [
        {
            variantId: 'variant-1',
            skuCode: 'SKU-LONG-0001',
            variantName: 'Produk Sangat Panjang Untuk Pengujian Workbench',
            productName: 'Produk Sangat Panjang Untuk Pengujian Workbench',
            productType: 'FINISHED_GOOD',
            basePrice: 10000,
            customPriceCount: 1,
            minPrice: 9000,
            maxPrice: 9000,
            prices: [
                {
                    id: 'price-1',
                    customerId: 'customer-1',
                    customerName: 'Customer Sintetis',
                    customerCode: 'CUS-1',
                    unitPrice: 9000,
                    deviationPercent: -10,
                    isActive: true,
                    notes: null,
                },
            ],
        },
    ],
    total: 51,
    page: 1,
    pageSize: 50,
    totalPages: 2,
};

const props = {
    initialPrices: prices,
    customers: [{ id: 'customer-1', name: 'Customer Sintetis', code: 'CUS-1' }],
    products: [
        {
            id: 'variant-1',
            name: 'Produk Sintetis',
            skuCode: 'SKU-LONG-0001',
            product: { name: 'Produk Sintetis', productType: 'FINISHED_GOOD' },
        },
    ],
    canManage: true,
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ success: true, data: prices });
});

describe('PriceListClient workbench', () => {
    it('exposes labelled filters, a captioned comparison region, result range, and keyboard disclosure', () => {
        render(<PriceListClient {...props} />);
        expect(screen.getByRole('searchbox', { name: 'Cari price list' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Filter customer price list' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Filter produk price list' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Filter kategori price list' })).toBeTruthy();
        expect(screen.getByRole('table', { name: 'Daftar harga produk per customer' })).toBeTruthy();
        const region = screen.getByRole('region', { name: /geser horizontal/i });
        expect(region.getAttribute('tabindex')).toBe('0');
        expect(screen.getAllByRole('status').some((node) => node.textContent?.includes('Menampilkan 1–50 dari 51'))).toBe(true);
        const disclosure = screen.getByRole('button', { name: 'Buka rincian harga SKU-LONG-0001' });
        disclosure.focus();
        expect(document.activeElement).toBe(disclosure);
        fireEvent.click(disclosure);
        expect(screen.getByRole('button', { name: 'Tutup rincian harga SKU-LONG-0001' })).toBeTruthy();
    });

    it('fails closed for write controls when pricing capability is false', () => {
        render(<PriceListClient {...props} canManage={false} />);
        expect(screen.queryByRole('button', { name: 'Sesuaikan Harga Massal' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Buka rincian harga SKU-LONG-0001' }));
        expect(screen.queryByRole('columnheader', { name: 'Aksi' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
        expect(screen.queryByText('Tambah harga customer')).toBeNull();
        expect(screen.queryByTestId('bulk-dialog')).toBeNull();
    });

    it('keeps failure distinct from empty and recovers on retry', async () => {
        render(<PriceListClient {...props} initialPrices={{ ...prices, data: [], total: 0, totalPages: 0 }} priceError="DB gagal" />);
        expect(screen.getByRole('alert').textContent).toContain('Data tidak dianggap kosong');
        expect(screen.getByText('Tidak ada produk untuk filter ini.')).toBeTruthy();
        mocks.list.mockResolvedValueOnce({ success: true, data: prices });
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(screen.getByText('SKU-LONG-0001')).toBeTruthy();
    });

    it('reports auxiliary filter degradation without hiding the main list', () => {
        render(
            <PriceListClient
                {...props}
                customerOptionsError="customer down"
                productOptionsError="product down"
            />,
        );
        expect(screen.getByText(/Sebagian opsi filter belum dapat dimuat/)).toBeTruthy();
        expect(screen.getByText('SKU-LONG-0001')).toBeTruthy();
    });

    it('uses shared first/next/last pagination controls', async () => {
        render(<PriceListClient {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
        await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 50 })));
        fireEvent.click(screen.getByRole('button', { name: 'Halaman terakhir' }));
        await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 50 })));
    });
});
