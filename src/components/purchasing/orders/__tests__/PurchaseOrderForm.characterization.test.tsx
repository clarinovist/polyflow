// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { CreatePurchaseOrderValues, UpdatePurchaseOrderValues } from '@/lib/schemas/purchasing';
import { PurchaseOrderForm } from '../PurchaseOrderForm';

// Real RHF, Zod, UI controls, price parsing and PPN calculations. Only external
// action/navigation/notification boundaries are mocked; no database is exercised.
type ActionResult = { success: boolean; data?: { id: string }; error?: string };
const mocks = vi.hoisted(() => ({
    create: vi.fn<(values: CreatePurchaseOrderValues) => Promise<ActionResult>>(),
    update: vi.fn<(values: UpdatePurchaseOrderValues) => Promise<ActionResult>>(),
    push: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock('@/actions/purchasing/purchasing', () => ({
    createPurchaseOrder: mocks.create,
    updatePurchaseOrder: mocks.update,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type Props = ComponentProps<typeof PurchaseOrderForm>;
type InitialData = NonNullable<Props['initialData']>;
type Item = InitialData['items'][number];
const NOW = new Date('2026-09-14T12:00:00.000Z');
const ORDER_DATE = new Date('2026-08-10T12:00:00.000Z');
const suppliers: Props['suppliers'] = [
    { id: 'fixture-supplier', name: 'Synthetic supplier', code: 'FIXTURE', paymentTermDays: 30 },
];
const productVariants: Props['productVariants'] = [
    { id: 'fixture-variant', name: 'Synthetic material', skuCode: 'FIXTURE-MAT', buyPrice: 100_000 },
];
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

function item(overrides: Partial<Item> = {}): Item {
    return {
        id: 'fixture-line', productVariantId: productVariants[0].id,
        quantity: 2, unitPrice: 100_000, discountPercent: 0,
        taxPercent: 0, dppOtherAmount: null, ppnMode: 'EXCLUDE', ...overrides,
    };
}
function initialData(overrides: Partial<InitialData> = {}): InitialData {
    return {
        id: 'fixture-order', supplierId: suppliers[0].id,
        orderDate: ORDER_DATE, expectedDate: null,
        deliveryAddress: 'Synthetic delivery address', notes: 'Synthetic notes',
        shippingCost: 0, items: [item()], ...overrides,
    };
}
function renderForm(props: Partial<Props> = {}) {
    return render(<PurchaseOrderForm suppliers={suppliers} productVariants={productVariants} {...props} />);
}
function desktopRow(index = 0) {
    return within(screen.getByRole('table')).getAllByRole('row')[index + 1];
}
function desktopInput(column: number, index = 0) {
    return within(within(desktopRow(index)).getAllByRole('cell')[column]).getByRole('textbox');
}
function mobileCard(index = 0) {
    const card = document.querySelector('div.md\\:hidden')?.children[index];
    if (!(card instanceof HTMLElement)) throw new Error('Missing mobile item card');
    return card;
}
function enter(input: HTMLElement, value: string) {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
}
function submit(mode: 'create' | 'edit' = 'edit') {
    fireEvent.click(screen.getByRole('button', {
        name: mode === 'edit' ? 'Simpan Perubahan' : 'Konfirmasi Purchase Order',
    }));
}
function expectGrandTotal(amount: string) {
    const heading = screen.getByText('Estimasi Total');
    expect(heading.nextElementSibling?.textContent?.replace(/\s/g, '')).toBe(`Rp${amount}`);
}
async function updatedPayload() {
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenCalledWith('/purchasing/orders/fixture-order');
    expect(mocks.create).not.toHaveBeenCalled();
    return mocks.update.mock.calls[0][0];
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn(() => {
        throw new Error('Unexpected network call in PO characterization');
    }));
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    mocks.create.mockResolvedValue({ success: true, data: { id: 'fixture-created-order' } });
    mocks.update.mockResolvedValue({ success: true });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    } else {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
});

describe('PurchaseOrderForm characterization', () => {
    it('creates from defaults with real supplier/product pickers and normalized metadata', async () => {
        renderForm();
        const supplierField = screen.getByText('Pilih Supplier').parentElement;
        if (!supplierField) throw new Error('Missing supplier field');
        fireEvent.click(within(supplierField).getByRole('combobox'));
        fireEvent.click(await screen.findByRole('option', { name: /Synthetic supplier/ }));
        fireEvent.click(within(desktopRow()).getByRole('combobox'));
        fireEvent.click(await screen.findByRole('option', { name: /FIXTURE-MAT/ }));
        enter(screen.getByLabelText('Ongkir'), '1250,5');
        enter(screen.getByLabelText('Dikirim Ke'), 'Synthetic destination');
        enter(screen.getByPlaceholderText(/Tambahkan catatan internal/), 'Synthetic memo');
        expect(screen.getByText('30 Hari')).toBeTruthy();
        submit('create');
        await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
        expect(mocks.create.mock.calls[0][0]).toEqual({
            supplierId: suppliers[0].id, orderDate: NOW,
            expectedDate: new Date('2026-09-21T12:00:00.000Z'),
            deliveryAddress: 'Synthetic destination', notes: 'Synthetic memo',
            shippingCost: 1250.5,
            items: [{ productVariantId: productVariants[0].id, quantity: 1, unitPrice: 100_000,
                discountPercent: 0, taxPercent: 0, dppOtherAmount: 91666.67, ppnMode: 'EXCLUDE' }],
        });
        expect(window.confirm).not.toHaveBeenCalled();
        expect(mocks.push).toHaveBeenCalledWith('/purchasing/orders/fixture-created-order');
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('submits the edit ID and original item ID through the actual update schema', async () => {
        renderForm({ mode: 'edit', initialData: initialData() });
        submit();
        expect(await updatedPayload()).toEqual({
            ...initialData(), items: [item({ dppOtherAmount: 183333.33 })],
        });
        expect(window.confirm).toHaveBeenCalledOnce();
        expect(toast.success).toHaveBeenCalledWith('Purchase Order berhasil diupdate');
    });

    it('cancels edit confirmation without dispatch, redirect or pending state', async () => {
        vi.mocked(window.confirm).mockReturnValue(false);
        renderForm({ mode: 'edit', initialData: initialData() });
        submit();
        await waitFor(() => expect(window.confirm).toHaveBeenCalledOnce());
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.push).not.toHaveBeenCalled();
        expect((screen.getByRole('button', { name: 'Simpan Perubahan' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('surfaces Zod validation for an empty form without dispatching an action', async () => {
        renderForm();
        submit('create');
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Supplier is required'));
        expect(screen.getByText('Supplier is required')).toBeTruthy();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('renders EXCLUDE totals with real discount, PPN and shipping calculations', () => {
        renderForm({ mode: 'edit', initialData: initialData({
            shippingCost: 5000, items: [item({ discountPercent: 10, taxPercent: 11 })],
        }) });
        expectGrandTotal('204.800');
        expect(within(desktopRow()).getAllByRole('cell')[6].textContent?.replace(/\s/g, '')).toBe('Rp199.800');
        expect(within(mobileCard()).getByText('Total').nextElementSibling?.textContent?.replace(/\s/g, '')).toBe('Rp199.800');
    });

    it('preserves INCLUDE desktop DPP versus mobile gross presentation and mode switching', () => {
        renderForm({ mode: 'edit', initialData: initialData({
            shippingCost: 5000, items: [item({ quantity: 1, unitPrice: 111_000, taxPercent: 11, ppnMode: 'INCLUDE' })],
        }) });
        expectGrandTotal('116.000');
        expect(within(desktopRow()).getAllByRole('cell')[6].textContent?.replace(/\s/g, '')).toBe('Rp100.000');
        expect(within(mobileCard()).getByText('Total').nextElementSibling?.textContent?.replace(/\s/g, '')).toBe('Rp111.000');
        fireEvent.click(within(mobileCard()).getByRole('radio', { name: 'Exclude (harga + pajak)' }));
        expectGrandTotal('128.210');
    });

    it.each(['desktop', 'mobile'] as const)('keeps decimal qty and localized price editing in the %s renderer', async (view) => {
        renderForm({ mode: 'edit', initialData: initialData() });
        const qty = view === 'desktop' ? desktopInput(2) : within(mobileCard()).getAllByRole('textbox')[0];
        const price = view === 'desktop' ? desktopInput(3) : within(mobileCard()).getAllByRole('textbox')[1];
        fireEvent.change(qty, { target: { value: '' } });
        expect((qty as HTMLInputElement).value).toBe('');
        enter(qty, '2,5');
        enter(price, '1.234,5');
        expect((qty as HTMLInputElement).value).toBe('2.5');
        expectGrandTotal('3.086');
        submit();
        expect((await updatedPayload()).items[0]).toMatchObject({ quantity: 2.5, unitPrice: 1234.5, dppOtherAmount: 2829.06 });
    });

    it.each(['create', 'edit'] as const)('shows a %s action error, re-enables submit, and does not redirect', async (mode) => {
        const action = mode === 'create' ? mocks.create : mocks.update;
        action.mockResolvedValue({ success: false, error: 'Synthetic action rejection' });
        renderForm({ mode, initialData: initialData() });
        submit(mode);
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic action rejection'));
        expect(action).toHaveBeenCalledOnce();
        expect(mocks.push).not.toHaveBeenCalled();
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect((screen.getByRole('button', { name: mode === 'create' ? 'Konfirmasi Purchase Order' : 'Simpan Perubahan' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('renders the existing invoice/received warnings without inventing unavailable lock data', () => {
        renderForm({ mode: 'edit', initialData: initialData() });
        expect(screen.getByText('Harga satuan tidak bisa diubah jika sudah ada invoice')).toBeTruthy();
        expect(screen.getByText('Qty tidak bisa dikurangi di bawah jumlah yang sudah diterima')).toBeTruthy();
        // The public props contain neither invoice state nor received quantities.
        // Existing controls are not disabled/min-constrained; service enforcement
        // is outside this render-only characterization (not an approved policy).
        expect((desktopInput(3) as HTMLInputElement).disabled).toBe(false);
        expect(desktopInput(2).getAttribute('min')).toBeNull();
    });

    it('preserves surviving row DOM identity when removing a middle item and appending', () => {
        renderForm({ mode: 'edit', initialData: initialData({ items: [
            item({ id: 'fixture-a' }), item({ id: 'fixture-b' }), item({ id: 'fixture-c' }),
        ] }) });
        const survivingInput = desktopInput(2, 2);
        const survivingCard = mobileCard(2);
        const deleteButton = within(desktopRow(1)).getAllByRole('button').find((button) => button.querySelector('.lucide-trash-2'));
        if (!deleteButton) throw new Error('Missing delete button');
        fireEvent.click(deleteButton);
        expect(desktopInput(2, 1)).toBe(survivingInput);
        expect(mobileCard(1)).toBe(survivingCard);
        fireEvent.click(screen.getByRole('button', { name: /Tambah Item/ }));
        expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
        expect(desktopInput(2, 1)).toBe(survivingInput);
    });
});
