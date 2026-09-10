// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileWalkInDispatchForm } from '../MobileWalkInDispatchForm';
import { MobileWalkInReceiptForm } from '../MobileWalkInReceiptForm';

const { createReceipt, createDispatch, push, refresh } = vi.hoisted(() => ({
    createReceipt: vi.fn(),
    createDispatch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
}));

vi.stubGlobal('crypto', { randomUUID: () => 'test-id' });
vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: vi.fn(), push, refresh }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/actions/purchasing/purchasing', () => ({
    createWalkInGoodsReceipt: (...args: unknown[]) => createReceipt(...args),
}));
vi.mock('@/actions/inventory/walk-in-dispatch', () => ({
    createEmergencyDispatch: (...args: unknown[]) => createDispatch(...args),
}));
vi.mock('@/components/customers/CustomerCombobox', () => ({
    CustomerCombobox: ({
        customers,
        value,
        onChange,
    }: {
        customers: Array<{ id: string; name: string }>;
        value: string;
        onChange: (value: string) => void;
    }) => (
        <select
            aria-label="Customer"
            value={value}
            onChange={(event) => onChange(event.target.value)}
        >
            <option value="">Pilih</option>
            {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                    {customer.name}
                </option>
            ))}
        </select>
    ),
}));

beforeEach(() => {
    vi.clearAllMocks();
    createReceipt.mockResolvedValue({ id: 'receipt-1' });
    createDispatch.mockResolvedValue({
        success: true,
        data: {
            salesOrder: { id: 'so-1', orderNumber: 'SO-1' },
            deliveryOrder: { id: 'do-1' },
            needsApproval: false,
        },
    });
});

const suppliers = [{ id: 'supplier-1', name: 'Supplier', code: null }];
const locations = [{ id: 'location-1', name: 'Gudang' }];
const products = [
    {
        id: 'variant-1',
        name: 'Produk',
        skuCode: 'SKU-1',
        primaryUnit: 'KG',
        standardCost: null,
    },
];

function selectOption(index: number, value: string) {
    fireEvent.change(screen.getAllByRole('combobox')[index], {
        target: { value },
    });
}

function confirmDialog() {
    fireEvent.click(screen.getByRole('button', { name: /^Ya,/ }));
}

describe('MobileWalkInReceiptForm decimal contract', () => {
    it('shows and submits the exact parsed quantity and money values', async () => {
        render(
            <MobileWalkInReceiptForm
                suppliers={suppliers}
                locations={locations}
                productVariants={products}
            />,
        );
        selectOption(0, 'supplier-1');
        selectOption(1, 'location-1');
        fireEvent.change(screen.getByPlaceholderText('Nomor nota dari supplier'), {
            target: { value: 'NOTA-1' },
        });
        selectOption(2, 'variant-1');
        fireEvent.change(screen.getAllByPlaceholderText('0')[0], {
            target: { value: '45,3' },
        });
        fireEvent.change(screen.getAllByPlaceholderText('0')[1], {
            target: { value: '5.304,17' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Catat Penerimaan' }));
        expect(screen.getByText(/45,3 @ Rp 5\.304,17/)).toBeTruthy();
        confirmDialog();

        await waitFor(() =>
            expect(createReceipt).toHaveBeenCalledWith(
                expect.objectContaining({
                    items: [
                        expect.objectContaining({
                            receivedQty: 45.3,
                            unitCost: 5304.17,
                        }),
                    ],
                }),
            ),
        );
    });

    it('blocks malformed and over-precision values', () => {
        render(
            <MobileWalkInReceiptForm
                suppliers={suppliers}
                locations={locations}
                productVariants={products}
            />,
        );
        selectOption(0, 'supplier-1');
        selectOption(1, 'location-1');
        fireEvent.change(screen.getByPlaceholderText('Nomor nota dari supplier'), {
            target: { value: 'NOTA-1' },
        });
        selectOption(2, 'variant-1');
        fireEvent.change(screen.getAllByPlaceholderText('0')[0], {
            target: { value: '1,2,3' },
        });
        fireEvent.change(screen.getAllByPlaceholderText('0')[1], {
            target: { value: '12,345' },
        });

        expect(
            (screen.getByRole('button', { name: 'Catat Penerimaan' }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        expect(createReceipt).not.toHaveBeenCalled();
    });
});

describe('MobileWalkInDispatchForm decimal contract', () => {
    it('shows and submits the exact parsed quantity', async () => {
        render(
            <MobileWalkInDispatchForm
                customers={[{ id: 'customer-1', name: 'Customer', code: null }]}
                locations={locations}
                productVariants={[
                    { ...products[0], sellPrice: 1000, price: 900 },
                ]}
            />,
        );
        selectOption(0, 'customer-1');
        selectOption(1, 'location-1');
        fireEvent.change(screen.getByPlaceholderText('No. telp / WA / keterangan pickup'), {
            target: { value: 'WA-1' },
        });
        selectOption(2, 'variant-1');
        fireEvent.change(screen.getByPlaceholderText('0'), {
            target: { value: '45,3' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Buat Pesanan Dadakan' }));
        expect(screen.getByText(/Produk × 45,3 =/)).toBeTruthy();
        confirmDialog();

        await waitFor(() =>
            expect(createDispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    items: [
                        expect.objectContaining({ quantity: 45.3 }),
                    ],
                }),
            ),
        );
    });
});
