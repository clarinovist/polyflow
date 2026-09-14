// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DeliveryOrderDetail,
    type DeliveryOrderDetailData,
} from '../DeliveryOrderDetail';
import type { LoadVerifyPanel } from '@/components/warehouse/outgoing/LoadVerifyPanel';
import type { WarehouseAttachmentPanel } from '@/components/warehouse/WarehouseAttachmentPanel';
import type { PrintPreviewModal } from '@/components/ui/print-preview-modal';
import type { SuratJalanDotMatrixPrint } from '../SuratJalanDotMatrixPrint';
import { salesLabels } from '@/lib/labels';

const mocks = vi.hoisted(() => ({
    quantity: vi.fn(),
    notes: vi.fn(),
    readiness: vi.fn(),
    status: vi.fn(),
    reverse: vi.fn(),
    attach: vi.fn(),
    compress: vi.fn(),
    fetch: vi.fn(),
    refresh: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    load: vi.fn(),
    attachments: vi.fn(),
    preview: vi.fn(),
    print: vi.fn(),
}));

vi.mock('@/actions/inventory/deliveries', () => ({
    updateDeliveryItemQuantities: mocks.quantity,
    updateDeliveryItemNotes: mocks.notes,
    fetchDeliveryStockReadiness: mocks.readiness,
    updateDeliveryStatus: mocks.status,
    reverseDeliveryShipment: mocks.reverse,
}));
vi.mock('@/actions/sales/delivery-photos', () => ({
    attachDeliveryPhoto: mocks.attach,
}));
vi.mock('@/lib/media/compress-image', () => ({
    compressImageForUpload: mocks.compress,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('sonner', () => ({
    toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('next/image', () => ({
    default: ({ alt, src }: { alt: string; src: string }) => (
        <span role="img" aria-label={alt} data-src={src} />
    ),
}));

// Only pre-existing effectful children are mocked. The detail and extracted render
// leaves run for real, including quantity formatting, dialogs and file inputs.
vi.mock('@/components/warehouse/outgoing/LoadVerifyPanel', () => ({
    LoadVerifyPanel: (props: ComponentProps<typeof LoadVerifyPanel>) => {
        mocks.load(props);
        return <div data-testid="load-verification" />;
    },
}));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({
    EntityStatusTimeline: () => null,
}));
vi.mock('@/components/sales/StockReadinessBanner', () => ({
    StockReadinessBanner: () => null,
}));
vi.mock('@/components/sales/EditDeliveryPricingDialog', () => ({
    EditDeliveryPricingDialog: () => <button>Edit pricing</button>,
}));
vi.mock('@/components/warehouse/WarehouseAttachmentPanel', () => ({
    WarehouseAttachmentPanel: (
        props: ComponentProps<typeof WarehouseAttachmentPanel>,
    ) => {
        mocks.attachments(props);
        return (
            <button
                disabled={props.disabled}
                onClick={props.onAttachmentChange}
            >
                Evidence {props.checkpoint}
            </button>
        );
    },
}));
vi.mock('@/components/ui/print-preview-modal', () => ({
    PrintPreviewModal: (props: ComponentProps<typeof PrintPreviewModal>) => {
        mocks.preview(props);
        return props.open ? (
            <section aria-label={props.title}>
                {props.children}
                <button onClick={() => props.onOpenChange(false)}>
                    Close preview
                </button>
            </section>
        ) : null;
    },
}));
vi.mock('@/components/sales/SuratJalanDotMatrixPrint', () => ({
    SuratJalanDotMatrixPrint: (
        props: ComponentProps<typeof SuratJalanDotMatrixPrint>,
    ) => {
        mocks.print(props);
        return <div>Print fixture</div>;
    },
}));

function makeOrder(
    overrides: Partial<DeliveryOrderDetailData> = {},
): DeliveryOrderDetailData {
    return {
        id: 'fixture-do',
        orderNumber: 'DO-FIXTURE',
        salesOrderId: 'fixture-so',
        status: 'PENDING',
        deliveryDate: '2026-08-01',
        salesOrder: {
            orderNumber: 'SO-FIXTURE',
            customer: { name: 'Fixture customer' },
        },
        items: [
            {
                id: 'base',
                quantity: 100,
                notes: 'Initial note',
                productVariant: {
                    name: 'Base variant',
                    skuCode: 'BASE',
                    primaryUnit: 'KG',
                    product: { name: 'Fixture product' },
                },
            },
        ],
        ...overrides,
    };
}

function button(name: string) {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    vi.stubGlobal('fetch', mocks.fetch);
    Element.prototype.scrollIntoView = vi.fn();
    mocks.readiness.mockResolvedValue({ success: true, data: [] });
    for (const action of [
        mocks.quantity,
        mocks.notes,
        mocks.status,
        mocks.reverse,
        mocks.attach,
    ]) {
        action.mockResolvedValue({ success: true });
    }
    mocks.fetch.mockRejectedValue(new Error('Unexpected network request'));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('DeliveryOrderDetail characterization', () => {
    it('keeps sales-only controls separate from warehouse navigation without hiding fleet or timeline', () => {
        const order = makeOrder({
            status: 'SHIPPED',
            vehicle: {
                plateNumber: 'TEST-01',
                name: 'Fixture truck',
                ownershipType: 'FACTORY',
            },
        });
        const { rerender } = render(<DeliveryOrderDetail order={order} />);
        expect(button('Retur')).toBeDefined();
        expect(button('Edit pricing')).toBeDefined();
        expect(
            screen
                .getByRole('link', { name: 'SO-FIXTURE' })
                .getAttribute('href'),
        ).toBe('/sales/orders/fixture-so');
        expect(screen.getByText('TEST-01 — Fixture truck')).toBeDefined();
        expect(screen.getByText('Status tercapai: Dikirim')).toBeDefined();
        rerender(
            <DeliveryOrderDetail
                order={order}
                warehouseMode
                basePath="/warehouse/outgoing"
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Retur' }),
        ).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Edit pricing' }),
        ).toBeNull();
        expect(button('Batalkan Pengiriman')).toBeDefined();
        expect(
            screen
                .getByRole('link', { name: 'SO-FIXTURE' })
                .getAttribute('href'),
        ).toBe('/warehouse/outgoing/orders/fixture-so');
        expect(
            screen.getByRole('link', { name: 'Kembali' }).getAttribute('href'),
        ).toBe('/warehouse/outgoing');
        expect(screen.getByText('TEST-01 — Fixture truck')).toBeDefined();
    });

    it('requires locked load verification and explicit confirmation before shipping', async () => {
        const order = makeOrder({ status: 'LOADING' });
        const { rerender } = render(<DeliveryOrderDetail order={order} />);
        expect(button(salesLabels.tandaiDikirim).disabled).toBe(true);
        expect(button(salesLabels.tandaiDikirim).title).toBe(
            'Kunci verifikasi muat dulu',
        );
        expect(mocks.load).toHaveBeenLastCalledWith({
            deliveryOrderId: order.id,
            isVerified: false,
            canEdit: true,
            items: [
                {
                    id: 'base',
                    quantity: 100,
                    verifiedQuantity: undefined,
                    enteredQuantity: undefined,
                    enteredUnit: undefined,
                    conversionFactorSnapshot: undefined,
                    productVariant: order.items[0].productVariant,
                },
            ],
        });
        rerender(
            <DeliveryOrderDetail
                order={{ ...order, loadVerifiedAt: '2026-08-01T00:00:00Z' }}
            />,
        );
        expect(mocks.load).toHaveBeenLastCalledWith(
            expect.objectContaining({ isVerified: true, canEdit: false }),
        );
        fireEvent.click(button(salesLabels.tandaiDikirim));
        expect(mocks.status).not.toHaveBeenCalled();
        fireEvent.click(button(`Ya, ${salesLabels.tandaiDikirim}`));
        await waitFor(() =>
            expect(mocks.status).toHaveBeenCalledWith(order.id, 'SHIPPED'),
        );
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
        expect(mocks.success).toHaveBeenCalledWith(
            'Status berhasil diubah ke Dikirim',
        );
    });

    it('preserves next-step errors and re-enables the command without refreshing', async () => {
        mocks.status.mockResolvedValue({
            success: false,
            error: 'Fixture status failure',
        });
        render(<DeliveryOrderDetail order={makeOrder()} />);
        fireEvent.click(button('Mulai Muat'));
        await waitFor(() =>
            expect(mocks.error).toHaveBeenCalledWith('Fixture status failure'),
        );
        expect(mocks.status).toHaveBeenCalledWith('fixture-do', 'LOADING');
        expect(button('Mulai Muat').disabled).toBe(false);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it('displays alternate snapshots but edits existing base quantities, retaining keyed inputs and focus', async () => {
        const order = makeOrder();
        order.items.push({
            id: 'alternate',
            quantity: 24,
            enteredQuantity: 2,
            enteredUnit: 'ROLL',
            conversionFactorSnapshot: 12,
            productVariant: { name: 'Alternate', primaryUnit: 'KG' },
        });
        const { rerender } = render(<DeliveryOrderDetail order={order} />);
        expect(screen.getByText('100 KG')).toBeDefined();
        expect(screen.getByText('2 ROLL (24 KG)')).toBeDefined();
        fireEvent.click(button(salesLabels.editSjQty));
        const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
        expect(inputs.map((input) => input.value)).toEqual(['100', '24']);
        expect(
            within(inputs[1].closest('td')!).getByText('ROLL'),
        ).toBeDefined();
        inputs[1].focus();
        fireEvent.change(inputs[1], { target: { value: '36' } });
        expect(document.activeElement).toBe(inputs[1]);
        rerender(
            <DeliveryOrderDetail
                order={{ ...order, items: [...order.items].reverse() }}
            />,
        );
        expect(screen.getAllByRole('spinbutton')[0]).toBe(inputs[1]);
        expect(document.activeElement).toBe(inputs[1]);
        fireEvent.click(button(salesLabels.saveSjQty));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
        expect(mocks.quantity).toHaveBeenCalledWith({
            deliveryOrderId: order.id,
            items: [
                { id: 'base', quantity: 100 },
                { id: 'alternate', quantity: 36 },
            ],
        });
        expect(mocks.notes).toHaveBeenCalledWith({
            deliveryOrderId: order.id,
            items: [
                { id: 'base', notes: 'Initial note' },
                { id: 'alternate', notes: '' },
            ],
        });
        expect(screen.queryByRole('spinbutton')).toBeNull();
    });

    it('waits for quantity success before notes and retains drafts on partial failure', async () => {
        let resolveQuantity!: (result: { success: boolean }) => void;
        mocks.quantity.mockReturnValue(
            new Promise<{ success: boolean }>((resolve) => {
                resolveQuantity = resolve;
            }),
        );
        mocks.notes.mockResolvedValue({
            success: false,
            error: 'Fixture notes failure',
        });
        render(<DeliveryOrderDetail order={makeOrder()} />);
        fireEvent.click(button(salesLabels.editSjQty));
        const quantity = screen.getByRole('spinbutton') as HTMLInputElement;
        const notes = screen.getByPlaceholderText(
            salesLabels.sjItemNotesPlaceholder,
        ) as HTMLInputElement;
        fireEvent.change(quantity, { target: { value: '75' } });
        fireEvent.change(notes, { target: { value: 'Keep this draft' } });
        fireEvent.click(button(salesLabels.saveSjQty));
        expect(button('Menyimpan…').disabled).toBe(true);
        expect(mocks.notes).not.toHaveBeenCalled();
        resolveQuantity({ success: true });
        await waitFor(() =>
            expect(mocks.error).toHaveBeenCalledWith('Fixture notes failure'),
        );
        expect(quantity.value).toBe('75');
        expect(notes.value).toBe('Keep this draft');
        expect(button(salesLabels.saveSjQty).disabled).toBe(false);
        expect(mocks.success).not.toHaveBeenCalled();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it('rejects zero quantity before either save action', () => {
        render(<DeliveryOrderDetail order={makeOrder()} />);
        fireEvent.click(button(salesLabels.editSjQty));
        fireEvent.change(screen.getByRole('spinbutton'), {
            target: { value: '0' },
        });
        fireEvent.click(button(salesLabels.saveSjQty));
        expect(mocks.error).toHaveBeenCalledWith('Qty harus angka > 0');
        expect(mocks.quantity).not.toHaveBeenCalled();
        expect(mocks.notes).not.toHaveBeenCalled();
    });

    it('offers reversal only for SHIPPED without POD or paid/partial invoice', () => {
        const order = makeOrder({ status: 'SHIPPED' });
        const { rerender } = render(<DeliveryOrderDetail order={order} />);
        expect(button('Batalkan Pengiriman')).toBeDefined();
        for (const blocked of [
            { ...order, status: 'IN_TRANSIT' },
            { ...order, proofOfDeliveryAt: '2026-08-01' },
            ...['PAID', 'PARTIAL'].map((status) => ({
                ...order,
                salesOrder: {
                    invoices: [
                        { id: 'invoice', invoiceNumber: 'INV-FIXTURE', status },
                    ],
                },
            })),
        ]) {
            rerender(<DeliveryOrderDetail order={blocked} />);
            expect(
                screen.queryByRole('button', {
                    name: 'Batalkan Pengiriman',
                }),
            ).toBeNull();
        }
        rerender(
            <DeliveryOrderDetail
                order={{
                    ...order,
                    salesOrder: {
                        invoices: [
                            {
                                id: 'invoice',
                                invoiceNumber: 'INV-FIXTURE',
                                status: 'DRAFT',
                            },
                        ],
                    },
                }}
            />,
        );
        expect(button('Batalkan Pengiriman')).toBeDefined();
    });

    it('validates reversal reason length, sends the untrimmed reason and surfaces server failure', async () => {
        mocks.reverse.mockResolvedValue({
            success: false,
            error: 'Fixture reversal failure',
        });
        render(
            <DeliveryOrderDetail order={makeOrder({ status: 'SHIPPED' })} />,
        );
        fireEvent.click(button('Batalkan Pengiriman'));
        const reason = screen.getByPlaceholderText(
            'Alasan pembatalan (wajib, min. 5 karakter)',
        );
        fireEvent.change(reason, { target: { value: '  abc  ' } });
        expect(button('Ya, Batalkan Pengiriman').disabled).toBe(true);
        fireEvent.change(reason, { target: { value: '  fixture reason  ' } });
        fireEvent.click(button('Ya, Batalkan Pengiriman'));
        await waitFor(() =>
            expect(mocks.error).toHaveBeenCalledWith(
                'Fixture reversal failure',
            ),
        );
        expect(mocks.reverse).toHaveBeenCalledWith({
            deliveryOrderId: 'fixture-do',
            reason: '  fixture reason  ',
        });
        expect(mocks.refresh).not.toHaveBeenCalled();
        fireEvent.click(button('Batalkan Pengiriman'));
        expect(
            (
                screen.getByPlaceholderText(
                    'Alasan pembatalan (wajib, min. 5 karakter)',
                ) as HTMLTextAreaElement
            ).value,
        ).toBe('');
    });

    it('preserves print preview props and ordered SJ/invoice bundle links', () => {
        const order = makeOrder({
            status: 'CANCELLED',
            salesOrder: {
                invoices: [{ id: 'invoice-one', invoiceNumber: 'INV-ONE' }],
            },
        });
        const { rerender } = render(<DeliveryOrderDetail order={order} />);
        expect(
            screen
                .getByRole('link', { name: 'ESC/P (Dot Matrix)' })
                .getAttribute('href'),
        ).toBe('/api/print/delivery?id=fixture-do');
        expect(
            screen
                .getByRole('link', { name: 'ESC/P: SJ + Invoice' })
                .getAttribute('href'),
        ).toBe(
            '/api/print/bundle?doc=delivery:fixture-do&doc=invoice:invoice-one',
        );
        fireEvent.click(button('Cetak Surat Jalan'));
        expect(mocks.preview).toHaveBeenLastCalledWith(
            expect.objectContaining({
                open: true,
                title: 'Surat Jalan DO-FIXTURE',
                landscape: true,
            }),
        );
        expect(mocks.print).toHaveBeenLastCalledWith({
            order,
            showButton: false,
            previewMode: true,
            companyConfig: undefined,
        });
        fireEvent.click(button('Close preview'));
        expect(screen.queryByText('Print fixture')).toBeNull();
        rerender(
            <DeliveryOrderDetail
                order={{
                    ...order,
                    salesOrder: {
                        invoices: [
                            ...order.salesOrder!.invoices!,
                            { id: 'invoice-two', invoiceNumber: 'INV-TWO' },
                        ],
                    },
                }}
            />,
        );
        const select = screen.getByRole('combobox', {
            name: 'Cetak ESC/P surat jalan bersama invoice',
        }) as HTMLSelectElement;
        expect(
            Array.from(select.options).map((option) => [
                option.value,
                option.text,
            ]),
        ).toEqual([
            ['', 'ESC/P: SJ + Invoice…'],
            ['invoice-one', 'INV-ONE'],
            ['invoice-two', 'INV-TWO'],
        ]);
        fireEvent.change(select, { target: { value: '' } });
        expect(select.value).toBe('');
    });

    it('uploads POD through the retained file ref, compresses then attaches metadata and resets receiver', async () => {
        const compressed = new File(['compressed'], 'compressed.jpg', {
            type: 'image/jpeg',
        });
        mocks.compress.mockResolvedValue(compressed);
        mocks.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, url: '/fixture/pod.jpg' }),
        });
        const { container } = render(
            <DeliveryOrderDetail order={makeOrder({ status: 'ARRIVED' })} />,
        );
        const uploadButton = button('Upload Bukti Terima');
        expect(uploadButton.disabled).toBe(true);
        const receiver = screen.getByPlaceholderText(
            'Nama penerima',
        ) as HTMLInputElement;
        receiver.focus();
        fireEvent.change(receiver, { target: { value: 'Fixture receiver' } });
        expect(document.activeElement).toBe(receiver);
        const input =
            container.querySelector<HTMLInputElement>('input[type="file"]')!;
        const click = vi.spyOn(input, 'click');
        fireEvent.click(uploadButton);
        expect(click).toHaveBeenCalledTimes(1);
        const file = new File(['original'], 'original.png', {
            type: 'image/png',
        });
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
        expect(mocks.compress).toHaveBeenCalledWith(file, {
            fileName: expect.stringMatching(
                /^delivery-proof_of_delivery-\d+\.jpg$/,
            ),
        });
        const [url, request] = mocks.fetch.mock.calls[0] as [
            string,
            RequestInit,
        ];
        expect(url).toBe('/api/upload/delivery-photo');
        expect(request.method).toBe('POST');
        const data = request.body as FormData;
        expect(data.get('file')).toEqual(compressed);
        expect(data.get('deliveryOrderId')).toBe('fixture-do');
        expect(data.get('photoType')).toBe('proof_of_delivery');
        expect(mocks.attach).toHaveBeenCalledWith({
            deliveryOrderId: 'fixture-do',
            photoType: 'proof_of_delivery',
            publicUrl: '/fixture/pod.jpg',
            receivedBy: 'Fixture receiver',
        });
        expect(mocks.compress.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.fetch.mock.invocationCallOrder[0],
        );
        expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.attach.mock.invocationCallOrder[0],
        );
        expect(receiver.value).toBe('');
        expect(uploadButton.disabled).toBe(true);
    });

    it('keeps vehicle evidence visible and reports upload/attach failures without refresh', async () => {
        mocks.compress.mockResolvedValue(new File(['fixture'], 'fixture.jpg'));
        mocks.fetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => {
                throw new Error('not JSON');
            },
        });
        mocks.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, url: '/fixture/truck.jpg' }),
        });
        mocks.attach.mockResolvedValue({
            success: false,
            error: 'Fixture attachment failure',
        });
        const { container } = render(
            <DeliveryOrderDetail
                order={makeOrder({
                    status: 'LOADING',
                    vehiclePhotoUrl: '/fixture/old.jpg',
                })}
            />,
        );
        expect(
            screen
                .getByRole('img', { name: 'Foto Truk' })
                .getAttribute('data-src'),
        ).toBe('/fixture/old.jpg');
        const input =
            container.querySelector<HTMLInputElement>('input[type="file"]')!;
        const click = vi.spyOn(input, 'click');
        fireEvent.click(button('Ganti Foto Truk'));
        expect(click).toHaveBeenCalledTimes(1);
        const file = new File(['fixture'], 'fixture.png');
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() =>
            expect(mocks.error).toHaveBeenCalledWith(
                'Upload gagal (HTTP 503). Cek koneksi / R2.',
            ),
        );
        expect(mocks.attach).not.toHaveBeenCalled();
        expect(button('Ganti Foto Truk').disabled).toBe(false);
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() =>
            expect(mocks.error).toHaveBeenCalledWith(
                'Fixture attachment failure',
            ),
        );
        expect(mocks.attach).toHaveBeenCalledWith({
            deliveryOrderId: 'fixture-do',
            photoType: 'vehicle',
            publicUrl: '/fixture/truck.jpg',
            receivedBy: undefined,
        });
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(container.querySelector('input[type="file"]')).toBe(input);
    });

    it('filters operational evidence by checkpoint and disables terminal edits while preserving refresh callbacks', () => {
        const attachments = ['LOAD', 'DAMAGE', 'UNLOAD'].map((checkpoint) => ({
            id: checkpoint,
            checkpoint,
            documentType: 'PHOTO',
            url: '/fixture/evidence.jpg',
            createdAt: '2026-08-01',
        }));
        const order = makeOrder();
        const { rerender } = render(
            <DeliveryOrderDetail order={order} attachments={attachments} />,
        );
        for (const checkpoint of ['LOAD', 'DAMAGE']) {
            expect(mocks.attachments).toHaveBeenCalledWith(
                expect.objectContaining({
                    entityId: order.id,
                    entityLabel: order.orderNumber,
                    entityType: 'deliveryOrderId',
                    checkpoint,
                    disabled: false,
                    attachments: attachments.filter(
                        (item) => item.checkpoint === checkpoint,
                    ),
                }),
            );
        }
        fireEvent.click(button('Evidence LOAD'));
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
        rerender(
            <DeliveryOrderDetail
                order={{ ...order, status: 'CANCELLED' }}
                attachments={attachments}
            />,
        );
        expect(button('Evidence LOAD').disabled).toBe(true);
        expect(button('Evidence DAMAGE').disabled).toBe(true);
        expect(screen.queryByText('Foto Pengiriman')).toBeNull();
    });
});
