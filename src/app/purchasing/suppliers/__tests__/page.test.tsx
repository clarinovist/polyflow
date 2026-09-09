import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuppliersPage from '../page';

const { getSuppliers } = vi.hoisted(() => ({ getSuppliers: vi.fn() }));
vi.mock('@/actions/purchasing/supplier', () => ({ getSuppliers }));
vi.mock('@/components/purchasing/suppliers/SupplierListClient', () => ({ SupplierListClient: () => null }));
beforeEach(() => vi.clearAllMocks());

describe('SuppliersPage', () => {
    it('fetches supplier records on the server and passes fresh complete data to the list', async () => {
        const suppliers = [{ id: 's1', name: 'Supplier A', email: 'supplier@example.test', notes: 'Full edit data' }];
        getSuppliers.mockResolvedValue({ success: true, data: suppliers });
        const page = await SuppliersPage();
        expect(getSuppliers).toHaveBeenCalledExactlyOnceWith();
        expect(page.props.suppliers).toBe(suppliers);
    });

    it('passes genuine empty data', async () => {
        getSuppliers.mockResolvedValue({ success: true, data: [] });
        expect((await SuppliersPage()).props.suppliers).toEqual([]);
    });

    it('does not disguise a failed query as an empty supplier list', async () => {
        getSuppliers.mockResolvedValue({ success: false, error: 'Unavailable' });
        await expect(SuppliersPage()).rejects.toThrow('Gagal memuat supplier');
    });
});
