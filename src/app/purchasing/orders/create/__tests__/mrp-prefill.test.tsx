// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Page from '../page';
const mocks = vi.hoisted(() => ({ products: vi.fn() }));
vi.mock('@/actions/purchasing/supplier', () => ({ getSuppliers: async () => ({ success: true, data: [] }) }));
vi.mock('@/actions/inventory/inventory', () => ({ getProductVariants: mocks.products }));
vi.mock('@/components/purchasing/orders/PurchaseOrderForm', () => ({ PurchaseOrderForm: ({ initialProductVariantId }: { initialProductVariantId?: string }) => <p>Prefill: {initialProductVariantId ?? 'none'}</p> }));
beforeEach(() => { mocks.products.mockResolvedValue({ success: true, data: [{ id: 'variant-id', name: 'Bahan A', skuCode: 'SKU-NOT-ID', buyPrice: 120 }] }); });
afterEach(cleanup);
describe('MRP to purchase form contract', () => {
    it('accepts an actual available id, not an arbitrary SKU', async () => {
        render(await Page({ searchParams: Promise.resolve({ variantId: 'variant-id' }) }));
        expect(screen.getByText('Prefill: variant-id')).toBeTruthy();
        expect(screen.getByText(/belum ada transaksi dibuat/)).toBeTruthy();
    });
    it.each(['SKU-NOT-ID', 'other-tenant-id'])('does not prefill unavailable id %s', async (variantId) => {
        render(await Page({ searchParams: Promise.resolve({ variantId }) }));
        expect(screen.getByText('Prefill: none')).toBeTruthy();
        expect(screen.getByRole('alert')).toBeTruthy();
    });
    it('does not coerce repeated parameters', async () => {
        render(await Page({ searchParams: Promise.resolve({ variantId: ['variant-id', 'other'] }) }));
        expect(screen.getByText('Prefill: none')).toBeTruthy();
    });
});
