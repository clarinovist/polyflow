// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const { recordPayment, getOptions, createSettlement } = vi.hoisted(() => ({
    recordPayment: vi.fn(),
    getOptions: vi.fn(),
    createSettlement: vi.fn(),
}));

vi.mock('@/actions/finance/finance', () => ({
    recordCustomerPayment: recordPayment,
}));
vi.mock('@/actions/finance/barter-actions', () => ({
    getBarterOptions: getOptions,
    createBarterSettlement: createSettlement,
}));
vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('@/components/ui/popover', () => ({
    Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ui/command', () => ({
    Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandInput: () => <input aria-label="Cari invoice" />,
    CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => (
        <button type="button" onClick={onSelect}>{children}</button>
    ),
}));
vi.mock('@/components/ui/select', async () => {
    const ReactModule = await import('react');
    const Context = ReactModule.createContext<((value: string) => void) | null>(null);
    return {
        Select: ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (value: string) => void }) => (
            <Context.Provider value={onValueChange}>{children}</Context.Provider>
        ),
        SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => <div id={id}>{children}</div>,
        SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
        SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
            const onValueChange = ReactModule.useContext(Context);
            return <button type="button" onClick={() => onValueChange?.(value)}>{children}</button>;
        },
    };
});
vi.mock('@/components/finance/payments/PaymentMethodFields', () => ({
    PaymentMethodFields: ({
        onMethodChange,
        additionalMethods = [],
        allowedMethods,
        label = 'Metode Pembayaran',
    }: {
        onMethodChange: (value: string) => void;
        additionalMethods?: string[];
        allowedMethods?: string[];
        label?: string;
    }) => (
        <div>
            <span>{label}</span>
            <button type="button" onClick={() => onMethodChange('Cash')}>Tunai</button>
            {additionalMethods.includes('Barter') && (
                <button type="button" onClick={() => onMethodChange('Barter')}>Pilih Barter</button>
            )}
            {allowedMethods?.includes('Transfer BCA') && <span>Transfer tersedia</span>}
        </div>
    ),
}));

import { RecordCustomerPaymentDialog } from '../RecordCustomerPaymentDialog';

const invoices = [
    {
        id: 'invoice-1',
        invoiceNumber: 'INV-1',
        totalAmount: 600,
        paidAmount: 0,
        salesOrder: {
            orderNumber: 'SO-1',
            customerId: 'customer-1',
            customer: { name: 'PT Sama' },
        },
    },
];

describe('RecordCustomerPaymentDialog barter flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createSettlement.mockResolvedValue({
            success: true,
            data: { id: 'settlement-1', settlementNumber: 'BRT-00001' },
        });
    });

    it('only offers barter after an eligible external customer invoice is selected', async () => {
        getOptions.mockResolvedValue({
            success: true,
            data: { eligible: false, purchaseInvoices: [] },
        });
        render(
            <RecordCustomerPaymentDialog
                open
                onOpenChange={vi.fn()}
                invoices={invoices}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /INV-1/ }));
        await waitFor(() => expect(getOptions).toHaveBeenCalledWith('invoice-1'));
        expect(screen.queryByRole('button', { name: 'Pilih Barter' })).toBeNull();
    });

    it('routes eligible barter with optional cash disabled by default', async () => {
        getOptions.mockResolvedValue({
            success: true,
            data: {
                eligible: true,
                supplier: { id: 'supplier-1', name: 'PT Sama' },
                receivableBalance: 600,
                purchaseInvoices: [
                    {
                        id: 'purchase-1',
                        invoiceNumber: 'BILL-1',
                        totalAmount: 1000,
                        paidAmount: 0,
                        dueDate: null,
                    },
                ],
            },
        });
        render(
            <RecordCustomerPaymentDialog
                open
                onOpenChange={vi.fn()}
                invoices={invoices}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /INV-1/ }));
        await waitFor(() => screen.getByRole('button', { name: 'Pilih Barter' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih Barter' }));
        fireEvent.click(screen.getByRole('button', { name: /BILL-1/ }));
        fireEvent.change(screen.getByLabelText('Nominal barter'), {
            target: { value: '600' },
        });
        fireEvent.change(screen.getByLabelText('Catatan/kesepakatan'), {
            target: { value: 'Kesepakatan barter' },
        });

        expect(
            (
                screen.getByLabelText(
                    'Catat pembayaran tambahan sekarang',
                ) as HTMLButtonElement
            ).dataset.state,
        ).not.toBe('checked');
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Barter' }));

        await waitFor(() => expect(createSettlement).toHaveBeenCalledOnce());
        expect(createSettlement).toHaveBeenCalledWith(
            expect.objectContaining({
                invoiceId: 'invoice-1',
                purchaseInvoiceId: 'purchase-1',
                barterAmount: '600',
                includeCashPayment: false,
                notes: 'Kesepakatan barter',
                idempotencyKey: expect.any(String),
            }),
        );
        expect(recordPayment).not.toHaveBeenCalled();
    });
});
