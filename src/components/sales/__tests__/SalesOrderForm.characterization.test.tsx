// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateSalesOrderValues, UpdateSalesOrderValues } from '@/lib/schemas/sales';
import { SalesOrderForm } from '../SalesOrderForm';
import type { SalesOrderFormProps, SerializedProductVariant } from '../sales-order-types';

// Keep RHF, Zod, useAction, totals, PPN and unit normalization real. Only
// server/side-effect boundaries are replaced; these tests do not prove DB behavior.
const mocks = vi.hoisted(() => ({
    create: vi.fn<(values: CreateSalesOrderValues) => Promise<{ success: boolean }>>(),
    update: vi.fn<(values: UpdateSalesOrderValues) => Promise<{ success: boolean }>>(),
    push: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, back: mocks.back, refresh: mocks.refresh }),
}));
vi.mock('@/actions/sales/sales', () => ({
    createSalesOrder: mocks.create,
    updateSalesOrder: mocks.update,
}));
vi.mock('@/actions/sales/sales-team', () => ({
    getSalesTeamAction: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('@/actions/sales/customer', () => ({
    getCustomerCreditExposureAction: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('@/components/customers/CustomerDialog', () => ({ CustomerDialog: () => null }));
vi.mock('../QuickProductDialog', () => ({ QuickProductDialog: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const NOW = new Date('2026-09-14T12:00:00.000Z');
const ORDER_DATE = new Date('2026-08-10T12:00:00.000Z');
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

function customer(id: string): SalesOrderFormProps['customers'][number] {
    return {
        id, name: `Synthetic ${id}`, code: id.toUpperCase(),
        phone: null, email: null, billingAddress: null, shippingAddress: null,
        taxId: null, creditLimit: null, paymentTermDays: null,
        discountPercent: null, maxDiscountPercent: null, notes: null,
        isActive: true, latitude: null, longitude: null, photoUrl: null,
        province: null, city: null, district: null, village: null,
        defaultVehicleId: null, lifecycleStatus: 'ACTIVE', createdById: null,
        verifiedAt: null, verifiedById: null, mergedIntoId: null, source: null,
        createdAt: ORDER_DATE, updatedAt: ORDER_DATE,
    };
}
const customers = [customer('fixture-customer-a'), customer('fixture-customer-b')];

function product(overrides: Partial<SerializedProductVariant> = {}): SerializedProductVariant {
    return {
        id: 'fixture-variant-base', productId: 'fixture-product',
        name: 'Synthetic base product', skuCode: 'FIXTURE-BASE',
        price: 120_000, sellPrice: 120_000, buyPrice: null,
        primaryUnit: 'KG', salesUnit: 'KG', conversionFactor: 1,
        packagingContainerSize: null, attributes: null,
        minStockAlert: null, leadTimeDays: null, preferredSupplierId: null,
        reorderPoint: null, reorderQuantity: null, costingMethod: 'WEIGHTED_AVERAGE',
        standardCost: null, revenueAccountId: null, returnAccountId: null, archivedAt: null,
        createdAt: ORDER_DATE, updatedAt: ORDER_DATE,
        inventories: [],
        product: {
            id: 'fixture-product', name: 'Synthetic product', productType: 'FINISHED_GOOD',
            assetCategory: null, cogsAccountId: null, inventoryAccountId: null,
            revenueAccountId: null, wipAccountId: null,
            createdAt: ORDER_DATE, updatedAt: ORDER_DATE,
        },
        ...overrides,
    };
}
const baseProduct = product();
const alternateProduct = product({
    id: 'fixture-variant-alt', name: 'Synthetic bag product', skuCode: 'FIXTURE-BAG',
    price: 4_000, sellPrice: 4_000, salesUnit: 'ZAK', conversionFactor: 25,
    customerPrices: [
        { customerId: customers[1].id, unitPrice: 6_000, isActive: true },
    ],
});

type OrderItem = UpdateSalesOrderValues['items'][number];
function item(overrides: Partial<OrderItem> = {}): OrderItem {
    return {
        id: 'fixture-line-a', productVariantId: baseProduct.id,
        quantity: 2, unitPrice: 120_000, discountPercent: 0,
        taxPercent: 0, dppOtherAmount: null, ppnMode: 'EXCLUDE', isFreeItem: false,
        ...overrides,
    };
}

// initialData is the form-facing shape: the edit page supplies entered qty/price
// (not persisted base qty/price) for alternate-unit lines.
function editData(
    items: OrderItem[] = [item()],
    overrides: Partial<UpdateSalesOrderValues> = {},
): UpdateSalesOrderValues {
    return {
        id: 'fixture-order', customerId: customers[0].id, salesRepId: null,
        sourceLocationId: '', orderDate: ORDER_DATE, notes: 'Synthetic order notes',
        shippingCost: 0, items, ...overrides,
    };
}

function renderForm(props: Partial<SalesOrderFormProps> = {}) {
    return render(
        <SalesOrderForm
            customers={customers}
            products={[baseProduct, alternateProduct]}
            locations={[]}
            mode="create"
            lockedOrderType="MAKE_TO_STOCK"
            {...props}
        />,
    );
}

function desktopRow(index = 0) {
    // jsdom does not apply Tailwind breakpoints; deliberately scope desktop
    // controls to the table rather than accidentally targeting the mobile copy.
    return within(screen.getByRole('table')).getAllByRole('row')[index + 1];
}

function rowInput(column: number, index = 0) {
    return within(within(desktopRow(index)).getAllByRole('cell')[column]).getByRole('textbox');
}

function enter(input: HTMLElement, value: string) {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
}

async function selectCustomer(index: number) {
    fireEvent.click(screen.getByRole('combobox', { name: /customer/i }));
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(customers[index].name) }));
}

async function selectProduct(variant: SerializedProductVariant) {
    fireEvent.click(within(desktopRow()).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(variant.skuCode) }));
}

function submit(mode: 'create' | 'edit') {
    fireEvent.click(screen.getByRole('button', {
        name: mode === 'create' ? 'Buat Order' : 'Perbarui Order',
    }));
}

async function createdPayload() {
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/sales/orders'));
    expect(mocks.update).not.toHaveBeenCalled();
    return mocks.create.mock.calls[0][0];
}

async function updatedPayload() {
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/sales/orders'));
    expect(mocks.create).not.toHaveBeenCalled();
    return mocks.update.mock.calls[0][0];
}

function expectGrandTotal(formattedAmount: string) {
    const totalRow = screen.getByText('Total Keseluruhan').parentElement;
    expect(totalRow?.lastElementChild?.textContent?.replace(/\s/g, '')).toBe(`Rp${formattedAmount}`);
}

beforeEach(() => {
    vi.clearAllMocks();
    // Only Date is frozen: Radix, RHF and waitFor continue using real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn(() => {
        throw new Error('Unexpected network call in SalesOrderForm characterization');
    }));
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true, value: vi.fn(),
    });
    mocks.create.mockResolvedValue({ success: true });
    mocks.update.mockResolvedValue({ success: true });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    } else {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('SalesOrderForm payload characterization', () => {
    it('keeps locked order context out of selectable fields and saves notes from the summary section', async () => {
        renderForm();
        expect(screen.queryByRole('combobox', { name: /Tipe Pesanan/ })).toBeNull();
        const notes = screen.getByRole('textbox', { name: 'Catatan' });
        expect(notes.tagName).toBe('TEXTAREA');
        enter(notes, 'Synthetic delivery note');
        await selectCustomer(0);
        await selectProduct(baseProduct);
        submit('create');
        expect((await createdPayload()).notes).toBe('Synthetic delivery note');
    });

    it('creates from empty defaults with a picked customer/product and optional warehouse', async () => {
        renderForm();
        await selectCustomer(0);
        await selectProduct(baseProduct);
        submit('create');

        const payload = await createdPayload();
        expect(payload).toMatchObject({
            intent: 'order', customerId: customers[0].id, salesRepId: null,
            sourceLocationId: '', orderType: 'MAKE_TO_STOCK', orderDate: NOW,
            notes: '', shippingCost: 0,
        });
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toMatchObject({
            productVariantId: baseProduct.id, quantity: 1, unitPrice: 120_000,
            discountPercent: 0, taxPercent: 0, ppnMode: 'EXCLUDE', isFreeItem: false,
            enteredQuantity: undefined, enteredUnit: undefined,
            conversionFactorSnapshot: undefined, enteredUnitPrice: undefined,
        });
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('normalizes decimal-comma alternate qty and Indonesian price into a base-unit snapshot', async () => {
        renderForm();
        await selectCustomer(0);
        await selectProduct(alternateProduct);
        expect(rowInput(3)).toHaveProperty('value', '100.000');
        enter(rowInput(2), '2,5');
        enter(rowInput(3), '125.000');
        expectGrandTotal('312.500');
        submit('create');

        const payload = await createdPayload();
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toMatchObject({
            productVariantId: alternateProduct.id,
            quantity: 62.5, unitPrice: 5_000,
            enteredQuantity: 2.5, enteredUnit: 'ZAK',
            conversionFactorSnapshot: 25, enteredUnitPrice: 125_000,
            discountPercent: 0, taxPercent: 0, ppnMode: 'EXCLUDE',
        });
    });

    it('creates a reorder with a fresh date, copied commercial values and locked order type', async () => {
        renderForm({
            reorderData: {
                customerId: customers[0].id, sourceLocationId: '', orderType: 'MAKE_TO_ORDER',
                notes: 'Synthetic reorder', shippingCost: 1_700,
                items: [{
                    productVariantId: baseProduct.id, quantity: 3, unitPrice: 100_000,
                    discountPercent: 5, taxPercent: 11,
                }],
            },
        });
        expectGrandTotal('318.050');
        submit('create');

        const payload = await createdPayload();
        expect(payload).toMatchObject({
            intent: 'order', customerId: customers[0].id, sourceLocationId: '',
            orderDate: NOW, orderType: 'MAKE_TO_STOCK', notes: 'Synthetic reorder', shippingCost: 1_700,
        });
        expect(payload.items[0]).toMatchObject({
            productVariantId: baseProduct.id, quantity: 3, unitPrice: 100_000,
            discountPercent: 5, taxPercent: 11, ppnMode: 'EXCLUDE',
        });
        expect(payload.items[0].id).toBeUndefined();
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('does not dispatch or navigate when edit save confirmation is declined', async () => {
        vi.mocked(window.confirm).mockReturnValue(false);
        renderForm({ mode: 'edit', initialData: editData() });
        enter(rowInput(2), '4');
        submit('edit');

        await waitFor(() => expect(window.confirm).toHaveBeenCalledOnce());
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('menyimpan perubahan'));
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.push).not.toHaveBeenCalled();
    });

    it.each([
        { ppnMode: 'INCLUDE' as const, total: '201.000' },
        { ppnMode: 'EXCLUDE' as const, total: '222.978' },
    ])('keeps $ppnMode tax mode and edited discount in the confirmed update', async ({ ppnMode, total }) => {
        renderForm({
            mode: 'edit',
            initialData: editData([item({ unitPrice: 111_000, taxPercent: 11, ppnMode })], { shippingCost: 1_200 }),
        });
        enter(rowInput(4), '10');
        // 2 * 111,000 less 10% = 199,800. INCLUDE keeps that total;
        // EXCLUDE adds 21,978 tax. Shipping adds 1,200 in either case.
        expectGrandTotal(total);
        submit('edit');

        const payload = await updatedPayload();
        expect(payload).toMatchObject({
            id: 'fixture-order', customerId: customers[0].id, orderDate: ORDER_DATE,
            sourceLocationId: '', salesRepId: null, notes: 'Synthetic order notes', shippingCost: 1_200,
        });
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toMatchObject({
            id: 'fixture-line-a', productVariantId: baseProduct.id,
            quantity: 2, unitPrice: 111_000, discountPercent: 10, taxPercent: 11, ppnMode,
        });
        // The EXCLUDE auto-DPP snapshot is 199,800 * 11/12.
        // INCLUDE DPP-other semantics are not asserted as a finance contract here.
        if (ppnMode === 'EXCLUDE') expect(payload.items[0].dppOtherAmount).toBe(183_150);
        expect(window.confirm).toHaveBeenCalledOnce();
    });

    it('preserves distinct persisted item IDs for duplicate variants when editing only the second row', async () => {
        renderForm({
            mode: 'edit',
            initialData: editData([
                item(),
                item({ id: 'fixture-line-b', quantity: 3, unitPrice: 50_000 }),
            ]),
        });
        enter(rowInput(2, 1), '4');
        submit('edit');

        const payload = await updatedPayload();
        expect(payload.items).toHaveLength(2);
        expect(payload.items.map(({ id, productVariantId, quantity, unitPrice }) => ({
            id, productVariantId, quantity, unitPrice,
        }))).toEqual([
            { id: 'fixture-line-a', productVariantId: baseProduct.id, quantity: 2, unitPrice: 120_000 },
            { id: 'fixture-line-b', productVariantId: baseProduct.id, quantity: 4, unitPrice: 50_000 },
        ]);
    });

    it('removes the middle duplicate row without remounting the surviving rows or changing their persisted IDs', async () => {
        renderForm({
            mode: 'edit',
            initialData: editData([
                item({ discountPercent: 5 }),
                item({ id: 'fixture-line-b', quantity: 3, unitPrice: 50_000, discountPercent: 10 }),
                item({ id: 'fixture-line-c', quantity: 4, unitPrice: 25_000, discountPercent: 15 }),
            ]),
        });
        const firstRow = desktopRow(0);
        const lastRow = desktopRow(2);
        const lastQuantity = rowInput(2, 2);
        const lastMobileQuantity = screen.getAllByRole('textbox', { name: 'Qty (KG)' })[2];
        enter(lastQuantity, '6');
        // The final cell is the existing unlabelled remove button. Do not
        // change production labels/DOM as part of this move-only batch.
        const removeCell = within(desktopRow(1)).getAllByRole('cell')[7];
        fireEvent.click(within(removeCell).getByRole('button'));

        expect(desktopRow(0)).toBe(firstRow);
        expect(desktopRow(1)).toBe(lastRow);
        expect(rowInput(2, 1)).toBe(lastQuantity);
        expect(screen.getAllByRole('textbox', { name: 'Qty (KG)' })[1]).toBe(lastMobileQuantity);
        expect(lastMobileQuantity).toHaveProperty('value', '6');
        expect(rowInput(2, 1)).toHaveProperty('value', '6');
        expect(rowInput(4, 1)).toHaveProperty('value', '15');
        submit('edit');

        const payload = await updatedPayload();
        expect(payload.items.map(({ id, quantity, unitPrice, discountPercent }) => ({
            id, quantity, unitPrice, discountPercent,
        }))).toEqual([
            { id: 'fixture-line-a', quantity: 2, unitPrice: 120_000, discountPercent: 5 },
            { id: 'fixture-line-c', quantity: 6, unitPrice: 25_000, discountPercent: 15 },
        ]);
    });

    it.each([
        { accept: true, enteredPrice: 150_000, basePrice: 6_000 },
        { accept: false, enteredPrice: 125_000, basePrice: 5_000 },
    ])('handles customer repricing accept=$accept before normalizing the edited alternate-unit line', async ({ accept, enteredPrice, basePrice }) => {
        vi.mocked(window.confirm).mockReturnValueOnce(accept).mockReturnValue(true);
        renderForm({
            mode: 'edit',
            initialData: editData([item({
                productVariantId: alternateProduct.id, quantity: 3, unitPrice: 125_000,
                enteredQuantity: 3, enteredUnit: 'ZAK',
                conversionFactorSnapshot: 25, enteredUnitPrice: 125_000,
            })]),
        });
        await selectCustomer(1);
        expect(window.confirm).toHaveBeenNthCalledWith(1,
            'Customer berubah. Update harga item sesuai harga customer baru?');
        submit('edit');

        const payload = await updatedPayload();
        expect(payload.customerId).toBe(customers[1].id);
        expect(payload.items[0]).toMatchObject({
            id: 'fixture-line-a', productVariantId: alternateProduct.id,
            quantity: 75, unitPrice: basePrice,
            enteredQuantity: 3, enteredUnit: 'ZAK',
            conversionFactorSnapshot: 25, enteredUnitPrice: enteredPrice,
        });
        expect(window.confirm).toHaveBeenCalledTimes(2);
        expect(window.confirm).toHaveBeenNthCalledWith(2, expect.stringContaining('menyimpan perubahan'));
    });

    it('normalizes alternate-unit quantity and price entered through the mobile controls', async () => {
        renderForm({
            mode: 'edit',
            initialData: editData([item({
                productVariantId: alternateProduct.id, quantity: 2, unitPrice: 100_000,
                enteredQuantity: 2, enteredUnit: 'ZAK',
                conversionFactorSnapshot: 25, enteredUnitPrice: 100_000,
            })]),
        });
        enter(screen.getByRole('textbox', { name: 'Qty (ZAK)' }), '3,75');
        enter(screen.getByRole('spinbutton', { name: 'Harga /ZAK' }), '125000');
        expectGrandTotal('468.750');
        submit('edit');

        const payload = await updatedPayload();
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toMatchObject({
            id: 'fixture-line-a', productVariantId: alternateProduct.id,
            quantity: 93.75, unitPrice: 5_000,
            enteredQuantity: 3.75, enteredUnit: 'ZAK',
            conversionFactorSnapshot: 25, enteredUnitPrice: 125_000,
        });
    });

    it('keeps a nominal discount amount fixed when quantity changes and submits its recomputed percent', async () => {
        renderForm({ mode: 'edit', initialData: editData([item({ discountPercent: 10, taxPercent: 11 })]) });
        fireEvent.click(within(desktopRow()).getByTitle('Klik untuk mengubah tipe diskon (% / Rp)'));
        expect(rowInput(4)).toHaveProperty('value', '24.000');
        enter(rowInput(2), '4');
        expectGrandTotal('506.160');
        submit('edit');

        const payload = await updatedPayload();
        expect(payload.items[0]).toMatchObject({
            id: 'fixture-line-a', quantity: 4, unitPrice: 120_000,
            discountPercent: 5, taxPercent: 11, ppnMode: 'EXCLUDE', dppOtherAmount: 418_000,
        });
    });
});
