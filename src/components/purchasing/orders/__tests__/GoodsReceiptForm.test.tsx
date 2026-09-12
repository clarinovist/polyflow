// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    GoodsReceiptForm,
    goodsReceiptResolver,
} from '../GoodsReceiptForm';

const mocks = vi.hoisted(() => ({
    createGoodsReceipt: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/actions/purchasing/purchasing', () => ({
    createGoodsReceipt: (...args: unknown[]) =>
        mocks.createGoodsReceipt(...args),
}));
vi.mock('@/components/warehouse/WarehouseAttachmentPanel', () => ({
    WarehouseAttachmentPanel: () => null,
}));

const makeItems = () => [
    {
        id: 'po-item-1',
        productVariantId: 'variant-1',
        productName: 'Resin A',
        skuCode: 'RES-A',
        orderedQty: 525,
        receivedQty: 0,
        unit: 'kg',
    },
    {
        id: 'po-item-2',
        productVariantId: 'variant-2',
        productName: 'Resin B',
        skuCode: 'RES-B',
        orderedQty: 1075,
        receivedQty: 0,
        unit: 'kg',
    },
    {
        id: 'po-item-3',
        productVariantId: 'variant-3',
        productName: 'Resin C',
        skuCode: 'RES-C',
        orderedQty: 925,
        receivedQty: 0,
        unit: 'kg',
    },
];

function renderForm(items = makeItems()) {
    render(
        <GoodsReceiptForm
            purchaseOrderId="po-1"
            orderNumber="PO-001"
            items={items}
            locations={[{ id: 'location-1', name: 'Gudang Utama' }]}
            defaultLocationId="location-1"
        />,
    );
}

function quantityInputs(): HTMLInputElement[] {
    return screen.getAllByLabelText('Qty Masuk') as HTMLInputElement[];
}

function submitButton(): HTMLButtonElement {
    return screen.getByRole('button', {
        name: 'Simpan Penerimaan Barang',
    }) as HTMLButtonElement;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGoodsReceipt.mockResolvedValue({
        success: true,
        data: { id: 'receipt-1' },
    });
});
afterEach(cleanup);

describe('GoodsReceiptForm explicit quantities', () => {
    it('returns an empty-value resolver error result and remaps filtered item errors', async () => {
        const values = {
            purchaseOrderId: 'po-1',
            isMaklon: false,
            customerId: null,
            receivedDate: new Date('2026-09-12T00:00:00.000Z'),
            locationId: 'location-1',
            notes: '',
            items: [
                {
                    purchaseOrderItemId: 'po-item-1',
                    productVariantId: 'variant-1',
                    receivedQty: 0,
                },
                {
                    purchaseOrderItemId: 'po-item-2',
                    productVariantId: 'variant-2',
                    receivedQty: -2,
                },
                {
                    purchaseOrderItemId: 'po-item-3',
                    productVariantId: 'variant-3',
                    receivedQty: 1,
                },
            ],
        };
        const options: Parameters<typeof goodsReceiptResolver>[2] = {
            criteriaMode: 'firstError',
            fields: {},
            names: [],
            shouldUseNativeValidation: false,
        };

        const result = await goodsReceiptResolver(values, undefined, options);

        expect(result.values).toEqual({});
        expect(Array.isArray(result.errors.items)).toBe(true);
        const itemErrors = result.errors.items as Array<
            { receivedQty?: { message?: string } } | undefined
        >;
        expect(itemErrors[0]).toBeUndefined();
        expect(itemErrors[1]?.receivedQty?.message).toBe(
            'Quantity must be positive',
        );
        expect(itemErrors[2]).toBeUndefined();
    });

    it('starts every quantity at zero and requires a positive canonical quantity', () => {
        renderForm();

        expect(quantityInputs().map((input) => input.value)).toEqual([
            '0',
            '0',
            '0',
        ]);
        expect(submitButton().disabled).toBe(true);

        fireEvent.change(quantityInputs()[0], { target: { value: '0.00004' } });
        expect(submitButton().disabled).toBe(true);
        expect(mocks.createGoodsReceipt).not.toHaveBeenCalled();

        fireEvent.change(quantityInputs()[0], { target: { value: '0.00005' } });
        expect(submitButton().disabled).toBe(false);
    });

    it('submits the canonical persisted quantity rather than the raw float', async () => {
        renderForm();

        fireEvent.change(quantityInputs()[0], { target: { value: '1.00005' } });
        fireEvent.click(submitButton());

        await waitFor(() =>
            expect(mocks.createGoodsReceipt).toHaveBeenCalledOnce(),
        );
        expect(
            mocks.createGoodsReceipt.mock.calls[0][0].items[0].receivedQty,
        ).toBe(1.0001);
    });

    it('blocks Enter submission immediately after a positive quantity is cleared', async () => {
        renderForm();

        const input = quantityInputs()[0];
        fireEvent.change(input, { target: { value: '2' } });
        expect(submitButton().disabled).toBe(false);

        fireEvent.change(input, { target: { value: '' } });
        expect(submitButton().disabled).toBe(true);

        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        await waitFor(() =>
            expect(input.getAttribute('aria-invalid')).toBe('true'),
        );
        expect(mocks.createGoodsReceipt).not.toHaveBeenCalled();
    });

    it('keeps validation errors attached to their visible quantity row', async () => {
        renderForm();

        const inputs = quantityInputs();
        fireEvent.change(inputs[1], { target: { value: '-2' } });
        fireEvent.change(inputs[2], { target: { value: '1' } });
        fireEvent.click(submitButton());

        await waitFor(() => {
            expect(inputs[0].getAttribute('aria-invalid')).toBe('false');
            expect(inputs[1].getAttribute('aria-invalid')).toBe('true');
        });
        expect(mocks.createGoodsReceipt).not.toHaveBeenCalled();
    });

    it('immutably omits untouched zero rows from the action payload after validation', async () => {
        const items = makeItems();
        const originalItems = structuredClone(items);
        renderForm(items);

        fireEvent.change(quantityInputs()[1], { target: { value: '2' } });
        fireEvent.click(submitButton());

        await waitFor(() => expect(mocks.createGoodsReceipt).toHaveBeenCalledOnce());
        const submitted = mocks.createGoodsReceipt.mock.calls[0][0];
        expect(submitted.items).toEqual([
            {
                purchaseOrderItemId: 'po-item-2',
                productVariantId: 'variant-2',
                receivedQty: 2,
            },
        ]);
        expect(items).toEqual(originalItems);
        expect(quantityInputs()[0].value).toBe('0');
        expect(quantityInputs()[2].value).toBe('0');
    });

    it('uses PO-line identity for duplicate variants and their over-receipt context', () => {
        renderForm([
            {
                ...makeItems()[0],
                id: 'po-item-duplicate-1',
                productName: 'Resin A - Baris 1',
                orderedQty: 10,
                receivedQty: 9,
            },
            {
                ...makeItems()[0],
                id: 'po-item-duplicate-2',
                productName: 'Resin A - Baris 2',
                orderedQty: 20,
                receivedQty: 0,
            },
        ]);

        expect(screen.getByText('Resin A - Baris 1')).toBeDefined();
        expect(screen.getByText('Resin A - Baris 2')).toBeDefined();

        fireEvent.change(quantityInputs()[1], { target: { value: '15' } });

        expect(screen.queryByText('Over receipt terdeteksi:')).toBeNull();
        expect(screen.queryByText(/Over:/)).toBeNull();
    });

    it('allows an explicit over-receipt and keeps its warning', async () => {
        renderForm([
            {
                ...makeItems()[0],
                orderedQty: 10,
                receivedQty: 2,
            },
        ]);

        fireEvent.change(quantityInputs()[0], { target: { value: '9' } });
        expect(screen.getByText('Over receipt terdeteksi:')).toBeDefined();
        fireEvent.click(submitButton());

        await waitFor(() => expect(mocks.createGoodsReceipt).toHaveBeenCalledOnce());
        expect(mocks.createGoodsReceipt.mock.calls[0][0].items[0].receivedQty).toBe(9);
    });

    it('preserves decimal comma input and submits its canonical number', async () => {
        renderForm();

        fireEvent.change(quantityInputs()[0], { target: { value: '1,25' } });
        expect(quantityInputs()[0].value).toBe('1,25');
        fireEvent.click(submitButton());

        await waitFor(() => expect(mocks.createGoodsReceipt).toHaveBeenCalledOnce());
        expect(mocks.createGoodsReceipt.mock.calls[0][0].items).toEqual([
            {
                purchaseOrderItemId: 'po-item-1',
                productVariantId: 'variant-1',
                receivedQty: 1.25,
            },
        ]);
    });
});
