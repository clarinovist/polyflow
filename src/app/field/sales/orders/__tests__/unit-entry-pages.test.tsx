import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatePage from '../create/page';
import EditPage from '../[id]/edit/page';
import DetailPage from '../[id]/page';
const mocks = vi.hoisted(() => ({ customers: vi.fn(), locations: vi.fn(), products: vi.fn(), order: vi.fn() }));
vi.mock('@/actions/sales/field-actions', () => ({ getMyFieldCustomers: mocks.customers, getFieldSalesOrderById: mocks.order }));
vi.mock('@/actions/inventory/inventory', () => ({ getLocations: mocks.locations, getProductVariants: mocks.products }));
vi.mock('@/actions/inventory/locations', () => ({ getLocations: mocks.locations }));
vi.mock('../create/QuickOrderWizard', () => ({ QuickOrderWizard: () => null }));
vi.mock('../[id]/edit/EditOrderClient', () => ({ EditOrderClient: () => null }));
vi.mock('../[id]/OrderDetailClient', () => ({ OrderDetailClient: () => null }));
vi.mock('@/components/mobile', () => ({ MobileReadError: () => null }));
vi.mock('@/components/mobile/MobileReadError', () => ({ MobileReadError: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); }, redirect: (to: string) => { throw new Error('Redirect ' + to); } }));
const variant = { id: 'v', name: 'Synthetic', skuCode: 'TEST', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: '25', sellPrice: '18500', product: { name: 'Synthetic', productType: 'FINISHED_GOOD' }, inventories: [{ locationId: 'l', quantity: '100' }] };
const original = { id: 'o', orderNumber: 'SO-TEST', status: 'CONFIRMED', updatedAt: '2026-10-23T00:00:00.123Z', orderDate: '2026-10-20', expectedDate: null, customer: null, invoices: [], totalAmount: '925000', items: [{ id: 'i', productVariantId: 'v', quantity: '50', unitPrice: '18500', enteredQuantity: '2', enteredUnit: 'BAL', enteredUnitPrice: '462500', conversionFactorSnapshot: '25', subtotal: '925000', deliveredQty: '0', productVariant: variant }], deliveryOrders: [] };
beforeEach(() => { vi.clearAllMocks(); mocks.customers.mockResolvedValue({ success: true, data: [] }); mocks.locations.mockResolvedValue({ success: true, data: [] }); mocks.products.mockResolvedValue({ success: true, data: [variant] }); mocks.order.mockResolvedValue({ success: true, data: original }); });
describe('field UOM DTO boundaries', () => {
    it('create serializes primary/sales/factor rather than a misleading display-only BAL', async () => {
        const page = await CreatePage({ searchParams: Promise.resolve({}) });
        expect(page.props.products[0]).toMatchObject({ primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 25, sellPrice: 18500, inventories: [{ quantity: 100 }] });
        expect(page.props.products[0]).not.toHaveProperty('displayUnit');
    });
    it('edit carries original quantities, snapshot, price and page version', async () => {
        const page = await EditPage({ params: Promise.resolve({ id: 'o' }) });
        expect(page.props.order.expectedUpdatedAt).toBe(original.updatedAt);
        expect(page.props.order.items[0]).toMatchObject({ id: 'i', quantity: 2, unitPrice: 462500, originalBaseQuantity: 50, originalBaseUnitPrice: 18500, enteredUnit: 'BAL', conversionFactorSnapshot: 25, units: { primaryUnit: 'KG', conversionFactor: 25 } });
    });
    it('edit passes invoice presence from the scoped read to the client locks', async () => {
        mocks.order.mockResolvedValue({ success: true, data: { ...original, invoices: [{ id: 'invoice' }] } });
        const page = await EditPage({ params: Promise.resolve({ id: 'o' }) });
        expect(page.props.order.hasInvoices).toBe(true);
    });
    it('detail labels base quantity/price with primary unit', async () => {
        const page = await DetailPage({ params: Promise.resolve({ id: 'o' }) });
        expect(page.props.order.items[0]).toMatchObject({ quantity: 50, unitPrice: 18500, primaryUnit: 'KG' });
    });
    it('fails closed on product read errors and noneditable order status', async () => {
        mocks.products.mockResolvedValue({ success: false });
        expect((await CreatePage({ searchParams: Promise.resolve({}) })).props.title).toBe('Form order belum tersedia');
        expect((await EditPage({ params: Promise.resolve({ id: 'o' }) })).props.title).toBe('Satuan produk belum tersedia');
        mocks.order.mockResolvedValue({ success: true, data: { ...original, status: 'DELIVERED' } });
        await expect(EditPage({ params: Promise.resolve({ id: 'o' }) })).rejects.toThrow('Redirect');
    });
});
