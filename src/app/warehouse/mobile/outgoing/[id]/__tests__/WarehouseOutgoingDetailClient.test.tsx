// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import {
    WarehouseOutgoingDetailClient,
    type WarehouseOutgoingOrder,
} from '../WarehouseOutgoingDetailClient';

const m = vi.hoisted(() => ({
    qty: vi.fn(),
    save: vi.fn(),
    lock: vi.fn(),
    correct: vi.fn(),
    status: vi.fn(),
    ship: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    toast: vi.fn(),
    editor: vi.fn(),
    revision: vi.fn(),
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: m.refresh, push: m.push, back: vi.fn() }),
}));
vi.mock('sonner', () => ({
    toast: { success: m.toast, error: m.toast, warning: m.toast },
}));
vi.mock('@/actions/inventory/deliveries', () => ({
    updateDeliveryItemQuantities: m.qty,
    saveDeliveryLoadVerification: m.save,
    confirmDeliveryLoadVerified: m.lock,
    correctDeliveryQtyToVerified: m.correct,
    updateDeliveryStatus: m.status,
}));
vi.mock('@/actions/inventory/delivery-shipment', () => ({
    shipDeliveryOrder: m.ship,
}));
vi.mock('@/actions/sales/delivery-revision', () => ({
    getDeliveryRevisionEditor: m.editor,
    findDeliveryRevisionProducts: vi.fn(),
    reviseDeliveryLoad: m.revision,
}));
vi.mock('@/components/warehouse/WarehouseAttachmentPanel', () => ({
    WarehouseAttachmentPanel: () => null,
}));
const fixture = (): WarehouseOutgoingOrder => ({
    id: 'do',
    orderNumber: 'SJ-TEST',
    status: 'LOADING',
    deliveryDate: '2026-10-21',
    loadVerifiedAt: null,
    salesOrder: {
        orderNumber: 'SO-TEST',
        items: [
            { productVariantId: 'variant', quantity: 200, deliveredQty: 25 },
        ],
    },
    items: [
        {
            id: 'line',
            productVariantId: 'variant',
            quantity: 125,
            enteredQuantity: 5,
            enteredUnit: 'BAL',
            conversionFactorSnapshot: 25,
            verifiedQuantity: null,
            productVariant: {
                name: 'Barang uji',
                primaryUnit: 'KG',
                skuCode: 'TEST',
            },
        },
    ],
});
function mount(order = fixture(), canReviseOrder = false) {
    return render(
        <WarehouseOutgoingDetailClient
            order={order}
            canReviseOrder={canReviseOrder}
        />,
    );
}
function open() {
    fireEvent.click(screen.getByRole('button', { name: 'Ubah muatan' }));
}
function qty(value: string) {
    fireEvent.change(screen.getByLabelText('Qty kirim Barang uji (KG)'), {
        target: { value },
    });
}
function review() {
    fireEvent.click(screen.getByRole('button', { name: 'Tinjau perubahan' }));
}

beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of [m.qty, m.save, m.lock, m.correct, m.status, m.ship])
        fn.mockResolvedValue({ success: true });
    m.editor.mockResolvedValue({ success: false, error: 'Editor synthetic' });
});
afterEach(cleanup);

describe('mobile load changes use shared verification and audited SJ action', () => {
    it.each(['PENDING', 'LOADING'])(
        'opens and cancels without mutation in %s',
        (status) => {
            mount({ ...fixture(), status });
            open();
            expect(
                screen.getByLabelText('Qty kirim Barang uji (KG)'),
            ).toHaveProperty('value', '125');
            fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
            expect(m.qty).not.toHaveBeenCalled();
            expect(m.save).not.toHaveBeenCalled();
            expect(m.lock).not.toHaveBeenCalled();
        },
    );
    it('prefills a primary-unit draft from BAL counts, reviews then saves without locking', async () => {
        mount();
        fireEvent.change(screen.getByLabelText('Dihitung Barang uji (BAL)'), {
            target: { value: '6' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Ubah muatan sesuai hitungan' }),
        );
        expect(
            screen.getByLabelText('Qty kirim Barang uji (KG)'),
        ).toHaveProperty('value', '150');
        expect(m.save).not.toHaveBeenCalled();
        expect(m.qty).not.toHaveBeenCalled();
        review();
        expect(screen.getByText('Muatan baru: 150 KG')).toBeTruthy();
        expect(document.activeElement).toBe(
            screen.getByRole('heading', { name: 'Tinjau perubahan muatan' }),
        );
        expect(m.qty).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Simpan perubahan SJ' }),
        );
        await waitFor(() =>
            expect(m.qty).toHaveBeenCalledWith({
                deliveryOrderId: 'do',
                items: [{ id: 'line', quantity: 150 }],
            }),
        );
        await waitFor(() => expect(m.refresh).toHaveBeenCalled());
        expect(m.correct).not.toHaveBeenCalled();
        expect(m.lock).not.toHaveBeenCalled();
        expect(m.save).not.toHaveBeenCalled();
    });
    it('allows editing locked loads and explains the required re-verification', async () => {
        mount({
            ...fixture(),
            loadVerifiedAt: '2026-10-21',
            items: [{ ...fixture().items[0], verifiedQuantity: 125 }],
        });
        open();
        qty('100');
        review();
        expect(
            screen.getByText(/Menyimpan perubahan akan membuka verifikasi/),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Simpan perubahan SJ' }),
        );
        await waitFor(() => expect(m.qty).toHaveBeenCalled());
        expect(m.ship).not.toHaveBeenCalled();
        expect(m.lock).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Tandai Dikirim' }),
            ).toBeNull(),
        );
        expect(screen.queryByLabelText('Dihitung Barang uji (BAL)')).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Muat ulang data' }),
        ).toBeTruthy();
    });
    it.each(['SHIPPED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'])(
        'hides mutation for %s',
        (status) => {
            mount({ ...fixture(), status });
            expect(
                screen.queryByRole('button', { name: 'Ubah muatan' }),
            ).toBeNull();
            expect(
                screen.queryByRole('button', { name: 'Kunci Verifikasi' }),
            ).toBeNull();
        },
    );
    it('blocks above SO residual and gives warehouse handoff without fetching Sales editor', () => {
        mount();
        open();
        qty('176');
        expect(screen.getByText('Batas SJ: 175 KG (sisa SO).')).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Tinjau perubahan' }),
        ).toHaveProperty('disabled', true);
        expect(screen.getByText(/Minta Sales\/Admin merevisi/)).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: 'Revisi SO + SJ' }),
        ).toBeNull();
        expect(m.editor).not.toHaveBeenCalled();
        expect(m.revision).not.toHaveBeenCalled();
    });
    it('offers the existing revision editor only to eligible users without saving the SJ first', async () => {
        mount(fixture(), true);
        open();
        qty('176');
        fireEvent.click(screen.getByRole('button', { name: 'Revisi SO + SJ' }));
        await waitFor(() => expect(m.editor).toHaveBeenCalledWith('do'));
        expect(await screen.findByText('Editor synthetic')).toBeTruthy();
        expect(m.qty).not.toHaveBeenCalled();
    });
    it.each(['', '-1'])(
        'blocks invalid quantity %s without silently coercing to zero',
        (value) => {
            mount();
            open();
            qty(value);
            expect(
                screen.getByRole('button', { name: 'Tinjau perubahan' }),
            ).toHaveProperty('disabled', true);
        },
    );
    it('accepts explicit zero, and keeps draft when returning from review', async () => {
        mount();
        open();
        qty('0');
        review();
        expect(screen.getByText('Muatan baru: 0 KG')).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Kembali mengedit' }),
        );
        expect(
            screen.getByLabelText('Qty kirim Barang uji (KG)'),
        ).toHaveProperty('value', '0');
        review();
        fireEvent.click(
            screen.getByRole('button', { name: 'Simpan perubahan SJ' }),
        );
        await waitFor(() =>
            expect(m.qty).toHaveBeenCalledWith({
                deliveryOrderId: 'do',
                items: [{ id: 'line', quantity: 0 }],
            }),
        );
    });
    it('retains review on a server guard failure without refreshing or locking', async () => {
        m.qty.mockResolvedValue({
            success: false,
            error: 'Qty melebihi sisa SO (maks 90). Hubungi sales.',
        });
        mount();
        open();
        qty('100');
        review();
        fireEvent.click(
            screen.getByRole('button', { name: 'Simpan perubahan SJ' }),
        );
        expect(await screen.findByRole('alert')).toHaveProperty(
            'textContent',
            'Qty melebihi sisa SO (maks 90). Hubungi sales.',
        );
        expect(screen.getByText('Muatan baru: 100 KG')).toBeTruthy();
        expect(m.refresh).not.toHaveBeenCalled();
        expect(m.lock).not.toHaveBeenCalled();
    });
    it('handles network failure and prevents duplicate save while pending', async () => {
        let reject!: (reason: Error) => void;
        m.qty.mockReturnValue(
            new Promise((_, no) => {
                reject = no;
            }),
        );
        mount();
        open();
        review();
        fireEvent.click(
            screen.getByRole('button', { name: 'Simpan perubahan SJ' }),
        );
        expect(
            screen.getByRole('button', { name: 'Menyimpan...' }),
        ).toHaveProperty('disabled', true);
        expect(screen.getByRole('button', { name: 'Batal' })).toHaveProperty(
            'disabled',
            true,
        );
        reject(new Error('network'));
        expect(await screen.findByRole('alert')).toHaveProperty(
            'textContent',
            'Gagal menyimpan muatan. Muat ulang untuk memastikan status sebelum mencoba lagi.',
        );
        expect(m.qty).toHaveBeenCalledTimes(1);
    });
    it.each(['', '-1'])(
        'does not save or use invalid physical count %s',
        (value) => {
            mount();
            fireEvent.change(
                screen.getByLabelText('Dihitung Barang uji (BAL)'),
                { target: { value } },
            );
            expect(
                screen.getByRole('button', { name: 'Simpan Verifikasi' }),
            ).toHaveProperty('disabled', true);
            expect(
                screen.getByRole('button', { name: 'Kunci Verifikasi' }),
            ).toHaveProperty('disabled', true);
            expect(
                screen.getByRole('button', {
                    name: 'Ubah muatan sesuai hitungan',
                }),
            ).toHaveProperty('disabled', true);
        },
    );
    it('locks only after matching counts and prevents opening load editor during save', async () => {
        let resolve!: (value: unknown) => void;
        m.save.mockReturnValue(
            new Promise((yes) => {
                resolve = yes;
            }),
        );
        mount();
        fireEvent.change(screen.getByLabelText('Dihitung Barang uji (BAL)'), {
            target: { value: '5' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Kunci Verifikasi' }),
        );
        expect(
            screen.getByRole('button', { name: 'Ubah muatan' }),
        ).toHaveProperty('disabled', true);
        expect(
            screen.getByRole('button', { name: 'Simpan Verifikasi' }),
        ).toHaveProperty('disabled', true);
        resolve({ success: true });
        await waitFor(() => expect(m.lock).toHaveBeenCalledWith('do'));
        expect(m.save).toHaveBeenCalledWith({
            deliveryOrderId: 'do',
            items: [{ id: 'line', verifiedQuantity: 125 }],
        });
    });
    it('keeps start-loading and actual shipment date flows', async () => {
        const view = mount({ ...fixture(), status: 'PENDING' });
        fireEvent.click(screen.getByRole('button', { name: 'Mulai Muat' }));
        await waitFor(() =>
            expect(m.status).toHaveBeenCalledWith('do', 'LOADING'),
        );
        view.unmount();
        mount({ ...fixture(), loadVerifiedAt: '2026-10-21' });
        fireEvent.click(screen.getByRole('button', { name: 'Tandai Dikirim' }));
        fireEvent.change(screen.getByLabelText(/Tanggal Penyerahan Aktual/), {
            target: { value: '2026-10-20' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Ya, Kirim' }));
        await waitFor(() =>
            expect(m.ship).toHaveBeenCalledWith({
                deliveryOrderId: 'do',
                actualShipmentDate: '2026-10-20',
            }),
        );
    });
});
