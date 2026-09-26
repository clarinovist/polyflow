// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';
import { Prisma, type SalesLostReason } from '@prisma/client';
import { calculateDueDate } from '@/lib/finance/payment-terms';
import type { createInvoice } from '@/actions/finance/invoice';
import { SalesOrderDetailClient } from '../SalesOrderDetailClient';
import type { SalesOrderDetailClientProps, SerializedSalesOrder } from '../sales-order-types';

type CommandResult = { success: boolean; error?: string; data?: unknown };
const mocks = vi.hoisted(() => ({
    confirm: vi.fn<(id: string) => Promise<CommandResult>>(),
    deliver: vi.fn<(id: string) => Promise<CommandResult>>(),
    cancel: vi.fn<(id: string) => Promise<CommandResult>>(),
    delete: vi.fn<(id: string) => Promise<CommandResult>>(),
    ready: vi.fn<(id: string) => Promise<CommandResult>>(),
    send: vi.fn<(id: string) => Promise<CommandResult>>(),
    accept: vi.fn<(id: string) => Promise<CommandResult>>(),
    reject: vi.fn<(id: string, reason: SalesLostReason, notes?: string) => Promise<CommandResult>>(),
    reopen: vi.fn<(id: string) => Promise<CommandResult>>(),
    followUp: vi.fn<(id: string, date: string | null) => Promise<CommandResult>>(),
    invoice: vi.fn<(payload: Parameters<typeof createInvoice>[0]) => Promise<CommandResult>>(),
    approvePrice: vi.fn<(payload: { orderId: string }) => Promise<CommandResult>>(),
    rejectPrice: vi.fn<(payload: { orderId: string; notes: string }) => Promise<CommandResult>>(),
    push: vi.fn(),
    refresh: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));
vi.mock('@/actions/sales/sales', () => ({
    confirmSalesOrder: mocks.confirm,
    deliverSalesOrder: mocks.deliver,
    cancelSalesOrder: mocks.cancel,
    deleteSalesOrder: mocks.delete,
    markReadyToShip: mocks.ready,
    sendQuotationOrder: mocks.send,
    acceptQuotationOrder: mocks.accept,
    rejectQuotationOrder: mocks.reject,
    reopenQuotationOrder: mocks.reopen,
    updateFollowUpDateAction: mocks.followUp,
}));
vi.mock('@/actions/finance/invoice', () => ({ createInvoice: mocks.invoice }));
vi.mock('@/actions/sales/price-list', () => ({ approvePriceAction: mocks.approvePrice, rejectPriceAction: mocks.rejectPrice }));
// Unchanged children with their own fetching/command lifecycles are boundaries.
// The detail component, extracted render leaves, Radix controls and date helpers stay real.
vi.mock('../ProductionStatusCard', () => ({ ProductionStatusCard: () => null }));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({ EntityStatusTimeline: () => null }));
vi.mock('../ShipmentDialog', () => ({
    ShipmentDialog: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div role="dialog" aria-label="Synthetic shipment" /> : null,
}));
vi.mock('../CreateDeliveryOrderDialog', () => ({
    CreateDeliveryOrderDialog: ({ triggerVariant }: { triggerVariant?: string }) => (
        <button data-variant={triggerVariant}>Buat Surat Jalan</button>
    ),
}));
vi.mock('../AddToScheduleDialog', () => ({ AddToScheduleDialog: () => null }));

const NOW = new Date('2026-09-14T12:00:00.000Z');
const customer: NonNullable<SerializedSalesOrder['customer']> = {
    id: 'fixture-customer', name: 'Synthetic Customer', code: 'FIXTURE',
    phone: null, email: null, billingAddress: null, shippingAddress: null,
    taxId: null, creditLimit: null, paymentTermDays: 30,
    discountPercent: null, maxDiscountPercent: null, notes: null,
    isActive: true, latitude: null, longitude: null, photoUrl: null,
    province: null, city: null, district: null, village: null,
    defaultVehicleId: null, lifecycleStatus: 'ACTIVE', createdById: null,
    verifiedAt: null, verifiedById: null, mergedIntoId: null, source: null,
    createdAt: NOW, updatedAt: NOW,
};

function order(overrides: Partial<SerializedSalesOrder> = {}): SerializedSalesOrder {
    return {
        id: 'fixture-order', orderNumber: 'SO-FIXTURE', customerId: customer.id,
        orderDate: NOW, expectedDate: null, orderType: 'MAKE_TO_STOCK', status: 'DRAFT',
        sourceLocationId: null, totalAmount: 125_000, notes: 'Synthetic notes',
        createdById: null, createdAt: NOW, updatedAt: NOW, discountAmount: null,
        taxAmount: null, shippingCost: null, quotationId: null, validUntil: null,
        subject: null, paymentTerms: null, shippingTerms: null, termsConditions: null,
        priceStatus: null, quotationSentAt: null, legacyQuotationId: null,
        nextFollowUpDate: null, lostReason: null, lostReasonNotes: null,
        entrySource: 'STANDARD', sourceReference: null, commercialReviewStatus: 'NOT_REQUIRED',
        idempotencyKey: null, salesRepId: null, items: [], customer, sourceLocation: null,
        invoices: [], productionOrders: [], movements: [], deliveryOrders: [], createdBy: null,
        ...overrides,
    };
}

function draftInvoice(): SerializedSalesOrder['invoices'][number] {
    return {
        id: 'fixture-invoice', invoiceNumber: 'INV-FIXTURE', salesOrderId: 'fixture-order',
        invoiceDate: NOW, dueDate: null, status: 'DRAFT', totalAmount: 125_000,
        roundingAmount: null, commercialSnapshot: null, paidAmount: 0, creditedAmount: 0, priceAdjustmentAmount: 0, notes: null, createdAt: NOW, updatedAt: NOW,
        termOfPaymentDays: 30,
    };
}

function renderOrder(overrides: Partial<SerializedSalesOrder> = {}, props: Omit<SalesOrderDetailClientProps, 'order'> = {}) {
    return render(<SalesOrderDetailClient order={order(overrides)} {...props} />);
}

function isDisabled(element: HTMLElement) {
    expect(element).toHaveProperty('disabled', true);
}

async function openMoreActions() {
    fireEvent.keyDown(screen.getByRole('button', { name: 'Lainnya' }), { key: 'Enter' });
    return screen.findByRole('menu');
}

async function openConfirmation(name = 'Batalkan pesanan') {
    const menu = await openMoreActions();
    fireEvent.click(within(menu).getByRole('menuitem', { name }));
    return screen.findByRole('alertdialog');
}

async function openInvoice() {
    fireEvent.click(screen.getByRole('button', { name: 'Buat Invoice' }));
    return screen.findByRole('dialog', { name: 'Buat Sales Invoice' });
}

function dateInput(dialog: HTMLElement, index = 0): HTMLInputElement {
    // Existing invoice labels have no htmlFor; characterize without changing markup.
    const input = dialog.querySelectorAll<HTMLInputElement>('input[type="date"]')[index];
    if (!input) throw new Error(`Missing invoice date input ${index}`);
    return input;
}

function submitInvoice(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Buat Invoice' }));
}

async function selectOption(dialog: HTMLElement, name: string) {
    fireEvent.click(within(dialog).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name }));
}

const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    for (const command of [mocks.confirm, mocks.deliver, mocks.cancel, mocks.delete, mocks.ready,
        mocks.send, mocks.accept, mocks.reject, mocks.reopen, mocks.followUp, mocks.invoice,
        mocks.approvePrice, mocks.rejectPrice]) {
        command.mockResolvedValue({ success: true });
    }
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network in detail characterization'); }));
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('SalesOrderDetailClient existing behavior (UI visibility is not authorization)', () => {
    it('separates the order identity, metadata and actions and localizes the header date', () => {
        renderOrder({ status: 'IN_PRODUCTION', orderNumber: 'SO-2026-0248', priceStatus: 'FINAL' });
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading.textContent).toBe('SO-2026-0248');
        expect(within(heading).queryByText('Dalam Produksi')).toBeNull();
        expect(screen.getByText('Dibuat pada 14 September 2026')).toBeTruthy();
        const actions = screen.getByRole('group', { name: 'Aksi pesanan' });
        expect(within(actions).getByRole('button', { name: 'Produksi Selesai' })).toBeTruthy();
        expect(within(actions).getByRole('button', { name: 'Buat Surat Jalan' }).getAttribute('data-variant')).toBe('outline');
        expect(actions.compareDocumentPosition(screen.getByText('Siapkan Jadwal Kirim atau Surat Jalan.')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('keeps shipping primary once production is no longer the next action', () => {
        const view = renderOrder({ status: 'READY_TO_SHIP' });
        expect(screen.getByRole('button', { name: 'Buat Surat Jalan' }).getAttribute('data-variant')).toBe('default');
        view.rerender(<SalesOrderDetailClient order={order({
            status: 'IN_PRODUCTION',
            deliveryOrders: [{ id: 'fixture-do', orderNumber: 'SJ-FIXTURE', status: 'PENDING', totalCharge: 0 }],
        })} />);
        const link = screen.getAllByRole('link').find((element) => element.textContent?.includes('SJ-FIXTURE'));
        expect(link?.getAttribute('data-variant')).toBe('outline');
        expect(link?.getAttribute('href')).toBe('/sales/deliveries/fixture-do');
    });

    it('compacts only the empty invoice state without removing its explanation', () => {
        const view = renderOrder();
        expect(screen.queryByText('Invoice yang diterbitkan untuk pesanan ini')).toBeNull();
        view.rerender(<SalesOrderDetailClient order={order({ invoices: [draftInvoice()] })} />);
        expect(screen.getByText('Invoice yang diterbitkan untuk pesanan ini')).toBeTruthy();
        expect(screen.getByRole('link', { name: /INV-FIXTURE/ })).toBeTruthy();
    });

    it('submits cancellation once after confirmation and locks actions until it finishes', async () => {
        let resolve: (result: CommandResult) => void = () => { throw new Error('Cancellation not started'); };
        mocks.cancel.mockImplementation(() => new Promise((done) => { resolve = done; }));
        renderOrder({ status: 'IN_PRODUCTION' });
        const confirmation = await openConfirmation();
        expect(mocks.cancel).not.toHaveBeenCalled();
        fireEvent.click(within(confirmation).getByRole('button', { name: 'Batalkan pesanan' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith('fixture-order');
        isDisabled(screen.getByRole('button', { name: 'Lainnya' }));
        isDisabled(screen.getByRole('button', { name: 'Produksi Selesai' }));
        await act(async () => resolve({ success: true }));
        expect(mocks.success).toHaveBeenCalledWith('Order SO-FIXTURE dibatalkan.');
        expect(mocks.refresh).toHaveBeenCalledOnce();
    });

    it('keeps cancellation behind confirmation, defaults focus to safety and allows dismissal', async () => {
        renderOrder({ status: 'IN_PRODUCTION' });
        expect(screen.queryByRole('button', { name: 'Batalkan pesanan' })).toBeNull();
        const confirmation = await openConfirmation();
        expect(mocks.cancel).not.toHaveBeenCalled();
        const back = within(confirmation).getByRole('button', { name: 'Kembali' });
        await waitFor(() => expect(document.activeElement).toBe(back));
        fireEvent.click(back);
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lainnya' })));
        expect(mocks.cancel).not.toHaveBeenCalled();
    });

    it.each(['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'] as const)(
        'retains cancellation availability for %s but not in warehouse mode', async (status) => {
            const view = renderOrder({ status });
            const menu = await openMoreActions();
            expect(within(menu).getByRole('menuitem', { name: 'Batalkan pesanan' })).toBeTruthy();
            expect(Boolean(within(menu).queryByRole('menuitem', { name: 'Hapus draf' }))).toBe(status === 'DRAFT');
            fireEvent.keyDown(menu, { key: 'Escape' });
            await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
            view.rerender(<SalesOrderDetailClient order={order({ status })} warehouseMode />);
            expect(screen.queryByRole('button', { name: 'Lainnya' })).toBeNull();
        },
    );

    it.each(['QUOTATION', 'QUOTATION_SENT', 'QUOTATION_REJECTED', 'QUOTATION_EXPIRED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const)(
        'does not expose cancellation or deletion for %s', (status) => {
            renderOrder({ status });
            expect(screen.queryByRole('button', { name: 'Lainnya' })).toBeNull();
        },
    );

    it.each([
        { status: 'CONFIRMED', count: 0, quick: true },
        { status: 'READY_TO_SHIP', count: 0, quick: true },
        { status: 'IN_PRODUCTION', count: 0, quick: false },
        { status: 'IN_PRODUCTION', count: 1, quick: true },
        { status: 'IN_PRODUCTION', count: 2, quick: false },
        { status: 'CONFIRMED', count: 2, quick: true },
        { status: 'READY_TO_SHIP', count: 2, quick: true },
    ] as const)('preserves advanced shipping gates for $status with $count open deliveries', async ({ status, count, quick }) => {
        renderOrder({ status, deliveryOrders: Array.from({ length: count }, (_, index) => ({
            id: `fixture-do-${index}`, orderNumber: `SJ-FIXTURE-${index}`, status: 'PENDING', totalCharge: 0,
        })) });
        const menu = await openMoreActions();
        const ship = within(menu).queryByRole('menuitem', { name: /lanjutan/ });
        expect(Boolean(ship)).toBe(quick);
        expect(within(menu).getByRole('menuitem', { name: 'Batalkan pesanan' }).hasAttribute('data-disabled')).toBe(false);
        if (ship) {
            expect(ship.hasAttribute('data-disabled')).toBe(count > 1);
            fireEvent.click(ship);
            if (count > 1) expect(screen.queryByRole('dialog', { name: 'Synthetic shipment' })).toBeNull();
            else expect(await screen.findByRole('dialog', { name: 'Synthetic shipment' })).toBeTruthy();
        }
    });

    it('keeps maklon closure in the advanced menu without offering physical delivery creation', async () => {
        renderOrder({ status: 'READY_TO_SHIP', orderType: 'MAKLON_JASA' });
        expect(screen.queryByRole('button', { name: 'Buat Surat Jalan' })).toBeNull();
        const menu = await openMoreActions();
        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Tutup Order Jasa' }));
        expect(await screen.findByRole('dialog', { name: 'Synthetic shipment' })).toBeTruthy();
    });

    it('keeps shipping guidance and warehouse navigation visible while details live in info', async () => {
        const view = renderOrder({ status: 'CONFIRMED' });
        expect(screen.getByText('Siapkan Jadwal Kirim atau Surat Jalan.')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Buka Portal Gudang →' }).getAttribute('href')).toBe('/warehouse/outgoing');
        expect(screen.queryByText(/satu SO hot-load/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Info alur kirim' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('rute harian multi-toko');
        expect(mocks.confirm).not.toHaveBeenCalled();
        view.rerender(<SalesOrderDetailClient order={order({ status: 'CONFIRMED' })} warehouseMode />);
        expect(screen.queryByRole('button', { name: 'Info alur kirim' })).toBeNull();
    });

    it('retains the service-only maklon warning and explains material consumption in info', async () => {
        renderOrder({ orderType: 'MAKLON_JASA', status: 'CONFIRMED' });
        expect(screen.getByText('Menagihkan jasa, bukan pengiriman stok fisik dari SO.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Info alur kirim' })).toBeNull();
        expect(screen.queryByText(/lokasi customer-owned/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Info alur maklon jasa' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('lokasi produksi lebih dulu');
    });

    it('shows sales draft controls and totals but hides commercial controls in warehouse mode', () => {
        const view = renderOrder({ priceStatus: 'PENDING' });
        expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/sales/orders/fixture-order/edit');
        expect(screen.getByRole('button', { name: 'Konfirmasi Order' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Approve Harga' })).toBeTruthy();
        expect(screen.getByRole('columnheader', { name: 'Harga Satuan' })).toBeTruthy();
        expect(screen.getByText('Total Keseluruhan')).toBeTruthy();

        view.rerender(<SalesOrderDetailClient order={order({ priceStatus: 'PENDING' })} warehouseMode />);
        for (const name of ['Konfirmasi Order', 'Approve Harga', 'Hapus', 'Batal']) {
            expect(screen.queryByRole('button', { name })).toBeNull();
        }
        expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
        expect(screen.queryByRole('columnheader', { name: 'Harga Satuan' })).toBeNull();
        expect(screen.queryByText('Total Keseluruhan')).toBeNull();
    });

    it('preserves quotation controls in warehouse mode and switches to operational controls by status', () => {
        const view = renderOrder({ status: 'QUOTATION' }, { warehouseMode: true });
        for (const name of ['Jadwalkan Follow-up', 'Kirim Penawaran', 'Terima', 'Tolak']) {
            expect(screen.getByRole('button', { name })).toBeTruthy();
        }
        expect(screen.queryByRole('button', { name: 'Konfirmasi Order' })).toBeNull();
        view.rerender(<SalesOrderDetailClient order={order({ status: 'IN_PRODUCTION' })} warehouseMode />);
        expect(screen.queryByRole('button', { name: 'Terima' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Produksi Selesai' })).toBeTruthy();
        view.rerender(<SalesOrderDetailClient order={order({ status: 'SHIPPED' })} warehouseMode />);
        expect(screen.getByRole('button', { name: 'Tandai Terkirim' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Buat Invoice' })).toBeNull();
    });

    it('locks pending commands then reports success, warnings and refresh in order', async () => {
        let resolve: (result: CommandResult) => void = () => { throw new Error('Deferred command not started'); };
        mocks.confirm.mockImplementation(() => new Promise((done) => { resolve = done; }));
        renderOrder();
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Order' }));
        expect(mocks.confirm).toHaveBeenCalledWith('fixture-order');
        isDisabled(screen.getByRole('button', { name: 'Konfirmasi Order' }));
        isDisabled(screen.getByRole('button', { name: 'Lainnya' }));
        expect(mocks.refresh).not.toHaveBeenCalled();
        await act(async () => { resolve({ success: true, data: { warnings: [{ message: 'Synthetic warning A' }, { message: 'Synthetic warning B' }] } }); });
        expect(mocks.success).toHaveBeenCalledWith('SO SO-FIXTURE dikonfirmasi. Siap diproses ke gudang.');
        expect(mocks.warning).toHaveBeenCalledWith('Synthetic warning A Synthetic warning B');
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect(mocks.success.mock.invocationCallOrder[0]).toBeLessThan(mocks.warning.mock.invocationCallOrder[0]);
        expect(mocks.warning.mock.invocationCallOrder[0]).toBeLessThan(mocks.refresh.mock.invocationCallOrder[0]);
        expect(screen.getByRole('button', { name: 'Konfirmasi Order' })).toHaveProperty('disabled', false);
    });

    it('preserves returned and thrown command errors without refresh and allows retry', async () => {
        mocks.cancel.mockResolvedValueOnce({ success: false, error: 'Synthetic denial' }).mockRejectedValueOnce(new Error('Synthetic failure'));
        renderOrder();
        let confirmation = await openConfirmation();
        fireEvent.click(within(confirmation).getByRole('button', { name: 'Batalkan pesanan' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Synthetic denial'));
        expect(screen.getByRole('button', { name: 'Lainnya' })).toHaveProperty('disabled', false);
        confirmation = await openConfirmation();
        fireEvent.click(within(confirmation).getByRole('button', { name: 'Batalkan pesanan' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Gagal memproses pesanan. Silakan coba lagi.'));
        expect(mocks.cancel).toHaveBeenCalledTimes(2);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it('requires delete confirmation and navigates to custom basePath without refresh', async () => {
        renderOrder({}, { basePath: '/fixture/orders' });
        expect(screen.getByRole('link', { name: 'Kembali' }).getAttribute('href')).toBe('/fixture/orders');
        expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/fixture/orders/fixture-order/edit');
        const confirmation = await openConfirmation('Hapus draf');
        expect(mocks.delete).not.toHaveBeenCalled();
        fireEvent.click(within(confirmation).getByRole('button', { name: 'Hapus draf' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/fixture/orders'));
        expect(mocks.delete).toHaveBeenCalledWith('fixture-order');
        expect(mocks.success).toHaveBeenCalledWith('Pesanan berhasil dihapus');
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it('restricts invoice UI to shipped/delivered with no invoice and disables legacy customerless orders', () => {
        const view = renderOrder({ status: 'READY_TO_SHIP' });
        expect(screen.queryByRole('button', { name: 'Buat Invoice' })).toBeNull();
        view.rerender(<SalesOrderDetailClient order={order({ status: 'SHIPPED' })} />);
        expect(screen.getByRole('button', { name: 'Buat Invoice' })).toHaveProperty('disabled', false);
        view.rerender(<SalesOrderDetailClient order={order({ status: 'DELIVERED', customerId: null, customer: null })} />);
        isDisabled(screen.getByRole('button', { name: 'Buat Invoice' }));
        expect(screen.getByText('Legacy Internal Stock Build')).toBeTruthy();
        expect(mocks.invoice).not.toHaveBeenCalled();
        view.rerender(<SalesOrderDetailClient order={order({ status: 'DELIVERED', invoices: [draftInvoice()] })} />);
        expect(screen.queryByRole('button', { name: 'Buat Invoice' })).toBeNull();
        expect(screen.getByRole('link', { name: 'Lihat Draf Invoice' }).getAttribute('href')).toBe('/finance/invoices/sales/fixture-invoice');
        expect(screen.getByRole('link', { name: /INV-FIXTURE/ })).toBeTruthy();
    });

    it('uses real due-date preview and omits dueDate for the default customer term', async () => {
        renderOrder({ status: 'SHIPPED' });
        const dialog = await openInvoice();
        fireEvent.change(dateInput(dialog), { target: { value: '2026-10-03' } });
        const computed = calculateDueDate(new Date('2026-10-03'), 30);
        expect(within(dialog).getByText(format(computed, 'dd MMM yyyy'))).toBeTruthy();
        submitInvoice(dialog);
        await waitFor(() => expect(mocks.invoice).toHaveBeenCalledOnce());
        expect(mocks.invoice.mock.calls[0][0]).toEqual({
            salesOrderId: 'fixture-order', invoiceDate: new Date('2026-10-03'),
            termOfPaymentDays: 30, notes: 'Invoice for Order SO-FIXTURE',
        });
        expect(mocks.success).toHaveBeenCalledWith(`Invoice berhasil dibuat. Jatuh tempo: ${format(computed, 'dd MMM yyyy')}`);
        expect(mocks.refresh).toHaveBeenCalledOnce();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('sends explicit computed dueDate for a custom term', async () => {
        renderOrder({ status: 'DELIVERED' });
        const dialog = await openInvoice();
        await selectOption(dialog, 'Custom...');
        fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '21' } });
        submitInvoice(dialog);
        await waitFor(() => expect(mocks.invoice).toHaveBeenCalledOnce());
        expect(mocks.invoice.mock.calls[0][0]).toEqual({
            salesOrderId: 'fixture-order', invoiceDate: new Date('2026-09-14'),
            termOfPaymentDays: 21, dueDate: calculateDueDate(new Date('2026-09-14'), 21),
            notes: 'Invoice for Order SO-FIXTURE',
        });
    });

    it('sends manual dueDate, retains the dialog on error and resets inputs on reopening', async () => {
        mocks.invoice.mockResolvedValue({ success: false, error: 'Synthetic invoice rejection' });
        renderOrder({ status: 'SHIPPED' });
        const dialog = await openInvoice();
        await selectOption(dialog, '7 hari');
        fireEvent.change(dateInput(dialog), { target: { value: '2026-10-03' } });
        fireEvent.click(within(dialog).getByRole('checkbox'));
        fireEvent.change(dateInput(dialog, 1), { target: { value: '2026-11-20' } });
        submitInvoice(dialog);
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Synthetic invoice rejection'));
        expect(mocks.invoice.mock.calls[0][0]).toEqual({
            salesOrderId: 'fixture-order', invoiceDate: new Date('2026-10-03'),
            termOfPaymentDays: 7, dueDate: new Date('2026-11-20'), notes: 'Invoice for Order SO-FIXTURE',
        });
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(mocks.refresh).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
        const reopened = await openInvoice();
        expect(dateInput(reopened).value).toBe('2026-09-14');
        expect(within(reopened).getByRole('checkbox')).toHaveProperty('checked', false);
        expect(within(reopened).getByRole('combobox').textContent).toBe('30 hari');
    });

    it('saves an ISO follow-up date and clears it through the existing command', async () => {
        renderOrder({ status: 'QUOTATION_SENT' });
        fireEvent.click(screen.getByRole('button', { name: 'Jadwalkan Follow-up' }));
        let dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Tanggal follow-up'), { target: { value: '2026-10-02' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
        await waitFor(() => expect(mocks.followUp).toHaveBeenCalledWith('fixture-order', '2026-10-02T00:00:00.000Z'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Jadwalkan Follow-up' }));
        dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Hapus jadwal' }));
        await waitFor(() => expect(mocks.followUp).toHaveBeenLastCalledWith('fixture-order', null));
        expect(mocks.refresh).toHaveBeenCalledTimes(2);
    });

    it.each([
        { scenario: 'without item tax', taxPercent: null, taxAmount: null, columns: 5 },
        { scenario: 'with zero item tax', taxPercent: 0, taxAmount: 0, columns: 5 },
        { scenario: 'with tax percent only', taxPercent: 11, taxAmount: 0, columns: 6 },
        { scenario: 'with tax amount only', taxPercent: 0, taxAmount: 550, columns: 6 },
        { scenario: 'with both tax fields', taxPercent: 11, taxAmount: 550, columns: 6 },
    ])('aligns all summary rows $scenario while preserving units and warehouse visibility', ({ taxPercent, taxAmount, columns }) => {
        const item: SerializedSalesOrder['items'][number] = {
            id: 'fixture-item', salesOrderId: 'fixture-order', productVariantId: 'fixture-variant',
            quantity: 50, unitPrice: 100, subtotal: 5_000, deliveredQty: 25,
            enteredQuantity: null, enteredUnit: null, enteredUnitPrice: null, conversionFactorSnapshot: null,
            isFreeItem: false, discountPercent: null,
            taxPercent: taxPercent === null ? null : new Prisma.Decimal(taxPercent),
            taxAmount: taxAmount === null ? null : new Prisma.Decimal(taxAmount),
            dppOtherAmount: new Prisma.Decimal(5_000), ppnMode: 'INCLUDE',
            createdAt: NOW, updatedAt: NOW,
            productVariant: {
                id: 'fixture-variant', productId: 'fixture-product', name: 'Synthetic bags', skuCode: 'FIXTURE-BAG',
                primaryUnit: 'KG', salesUnit: 'ZAK', conversionFactor: 25, packagingContainerSize: null,
                attributes: null, leadTimeDays: null, preferredSupplierId: null,
                revenueAccountId: null, returnAccountId: null, archivedAt: null, createdAt: NOW, updatedAt: NOW,
                product: {
                    id: 'fixture-product', name: 'Synthetic Product', productType: 'FINISHED_GOOD',
                    assetCategory: null, cogsAccountId: null, inventoryAccountId: null,
                    revenueAccountId: null, wipAccountId: null, createdAt: NOW, updatedAt: NOW,
                },
            },
        };
        const fixture = order({
            status: 'DELIVERED',
            items: [{ ...item, id: 'fixture-untaxed-item', taxPercent: null, taxAmount: null }, item],
            taxAmount: new Prisma.Decimal(550),
            shippingCost: new Prisma.Decimal(100), discountAmount: new Prisma.Decimal(50),
            deliveryOrders: [{ id: 'fixture-delivery', status: 'SHIPPED', totalCharge: 100 }],
        });
        const view = render(<SalesOrderDetailClient order={fixture} />);
        const table = within(screen.getByRole('table'));
        const row = table.getAllByRole('row')[1];
        expect(within(row).getByText('2 ZAK (50 KG)')).toBeTruthy();
        expect(within(row).getByText('1 ZAK (25 KG)')).toBeTruthy();
        expect(within(row).getByText(/2.500.*\/ZAK/)).toBeTruthy();
        expect(table.getAllByRole('columnheader')).toHaveLength(columns);
        expect(Boolean(table.queryByRole('columnheader', { name: 'DPP' }))).toBe(columns === 6);
        const tableElement = screen.getByRole<HTMLTableElement>('table');
        for (const itemRow of Array.from(tableElement.tBodies[0].rows)) {
            expect(itemRow.cells).toHaveLength(columns);
        }
        const footerRows = Array.from(tableElement.tFoot!.rows);
        expect(footerRows).toHaveLength(4);
        for (const footerRow of footerRows) {
            expect(Array.from(footerRow.cells).reduce((total, cell) => total + cell.colSpan, 0)).toBe(columns);
            expect(footerRow.cells[0].colSpan).toBe(columns - 1);
            expect(footerRow.cells[1].colSpan).toBe(1);
        }
        expect(footerRows.map((footerRow) => footerRow.cells[1].textContent?.replace(/\s/g, ''))).toEqual([
            '-Rp50', 'Rp550', 'Rp100', 'Rp125.000',
        ]);
        expect(table.getByText('(Include)')).toBeTruthy();
        expect(table.getByText('(dari armada)')).toBeTruthy();
        view.rerender(<SalesOrderDetailClient order={fixture} warehouseMode />);
        expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toBe(row);
        expect(screen.queryByRole('columnheader', { name: 'DPP' })).toBeNull();
        expect(within(row).getAllByRole('cell')).toHaveLength(3);
        expect(tableElement.tFoot).toBeNull();
        expect(within(tableElement).getAllByRole('columnheader')).toHaveLength(3);
    });

    it('aligns the total with the subtotal column for an empty order', () => {
        renderOrder();
        const table = screen.getByRole<HTMLTableElement>('table');
        expect(table.tHead!.rows[0].cells).toHaveLength(5);
        expect(table.tFoot!.rows).toHaveLength(1);
        expect(table.tFoot!.rows[0].cells[0].colSpan).toBe(4);
    });

    it('requires notes for LAINNYA and trims rejection payload before closing', async () => {
        renderOrder({ status: 'QUOTATION' });
        fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));
        const dialog = await screen.findByRole('dialog');
        isDisabled(within(dialog).getByRole('button', { name: 'Tolak penawaran' }));
        await selectOption(dialog, 'Lainnya');
        isDisabled(within(dialog).getByRole('button', { name: 'Tolak penawaran' }));
        fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  Synthetic reason  ' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Tolak penawaran' }));
        await waitFor(() => expect(mocks.reject).toHaveBeenCalledWith('fixture-order', 'LAINNYA', 'Synthetic reason'));
        expect(mocks.refresh).toHaveBeenCalledOnce();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
