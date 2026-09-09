import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplierDetailPage from '../page';

const { getSupplierById, getSupplierProducts, notFound } = vi.hoisted(() => ({
    getSupplierById: vi.fn(), getSupplierProducts: vi.fn(),
    notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));
vi.mock('@/actions/purchasing/supplier', () => ({ getSupplierById }));
vi.mock('@/actions/purchasing/supplier-product', () => ({ getSupplierProducts }));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/components/purchasing/suppliers/Supplier360Tabs', () => ({ Supplier360Tabs: () => null }));

const props = (tab?: string) => ({ params: Promise.resolve({ id: 'supplier-1' }), searchParams: Promise.resolve({ tab }) });
beforeEach(() => {
    vi.clearAllMocks();
    getSupplierById.mockResolvedValue({ success: true, data: { id: 'supplier-1', name: 'Supplier A' } });
    getSupplierProducts.mockResolvedValue({ success: true, data: [] });
});

describe('SupplierDetailPage', () => {
    it('passes merged products to the client without dropping history fields', async () => {
        const products = [{ id: 'variant-1', linkId: null, hasReceiptHistory: true, lastReceiptUnitCost: 100 }];
        getSupplierProducts.mockResolvedValue({ success: true, data: products });
        const page = await SupplierDetailPage(props('products'));
        expect(page.props.supplierProducts).toBe(products);
        expect(page.props.initialTab).toBe('products');
        expect(getSupplierProducts).toHaveBeenCalledWith('supplier-1');
    });

    it('accepts a genuine empty list and defaults to overview', async () => {
        const page = await SupplierDetailPage(props());
        expect(page.props.supplierProducts).toEqual([]);
        expect(page.props.initialTab).toBe('overview');
    });

    it('throws on product load failure instead of rendering a misleading zero count', async () => {
        getSupplierProducts.mockResolvedValue({ success: false, error: 'Unavailable' });
        await expect(SupplierDetailPage(props())).rejects.toThrow('Gagal memuat produk supplier');
    });

    it.each([
        { success: true, data: null },
        { success: false, error: 'Unavailable' },
    ])('does not fetch products for an unavailable supplier', async (response) => {
        getSupplierById.mockResolvedValue(response);
        await expect(SupplierDetailPage(props())).rejects.toThrow('NEXT_NOT_FOUND');
        expect(getSupplierProducts).not.toHaveBeenCalled();
    });
});
