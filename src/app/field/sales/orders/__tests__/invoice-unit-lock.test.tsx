// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EditPage from '../[id]/edit/page';
const mocks = vi.hoisted(() => ({ find: vi.fn(), scope: vi.fn().mockResolvedValue(undefined), products: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { salesOrder: { findUnique: mocks.find } } }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: vi.fn().mockResolvedValue({ user: { id: 'sales', role: 'SALES' } }) }));
vi.mock('@/services/sales/field-scope', () => ({ getFieldSalesScope: () => ({ userId: 'sales' }), assertCanAccessFieldOrder: mocks.scope }));
vi.mock('@/services/sales/orders-service', () => ({ updateOrder: vi.fn() }));
vi.mock('@/actions/inventory/inventory', () => ({ getProductVariants: mocks.products }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error('404'); }, redirect: () => { throw new Error('redirect'); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
afterEach(cleanup);
it('real scoped action -> edit page -> editor locks units and prices when invoice projection is present', async () => {
    const product = { id: 'v', name: 'Synthetic', product: { name: 'Synthetic', productType: 'FINISHED_GOOD' }, primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 25, skuCode: 'TEST', sellPrice: 1000 };
    mocks.products.mockResolvedValue({ success: true, data: [product] });
    mocks.find.mockImplementation(async (query) => ({
        id: 'order', orderNumber: 'SO-TEST', status: 'CONFIRMED', orderDate: new Date('2026-10-01'), updatedAt: new Date('2026-10-23'),
        ...(query.include.invoices ? { invoices: [{ id: 'invoice' }] } : {}),
        items: [{ id: 'item', productVariantId: 'v', productVariant: product, quantity: 25, unitPrice: 1000, subtotal: 25000, enteredQuantity: 1, enteredUnit: 'BAL', enteredUnitPrice: 25000, conversionFactorSnapshot: 25 }],
    }));
    render(await EditPage({ params: Promise.resolve({ id: 'order' }) }));
    expect(mocks.scope).toHaveBeenCalledWith({ userId: 'sales' }, 'order');
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ invoices: { select: { id: true } } }) }));
    expect(screen.getByRole('combobox', { name: 'Satuan item 1' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('spinbutton', { name: 'Harga per BAL' })).toHaveProperty('disabled', true);
});
