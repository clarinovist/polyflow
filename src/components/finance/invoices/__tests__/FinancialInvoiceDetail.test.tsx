// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const mockRefresh = vi.fn();
const mockUpdateInvoiceStatus = vi.fn();
const mockRecordCustomerPayment = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
    },
}));

vi.mock('@/actions/finance/invoice', () => ({
    updateInvoiceStatus: (...args: unknown[]) =>
        mockUpdateInvoiceStatus(...args),
}));

vi.mock('@/actions/finance/finance', () => ({
    recordCustomerPayment: (...args: unknown[]) =>
        mockRecordCustomerPayment(...args),
}));

vi.mock('@/components/shared/EntityStatusTimeline', () => ({
    EntityStatusTimeline: () => <div data-testid="timeline" />,
}));

vi.mock('@/components/finance/invoices/InvoiceDotMatrixPrint', () => ({
    InvoiceDotMatrixPrint: () => <div data-testid="dot-matrix-print" />,
}));

vi.mock('@/components/ui/print-preview-modal', () => ({
    PrintPreviewModal: () => <div data-testid="print-preview-modal" />,
}));

vi.mock('@/components/finance/payments/PaymentMethodFields', () => ({
    PaymentMethodFields: ({ method }: { method: string }) => (
        <div data-testid="payment-method-fields">{method}</div>
    ),
}));

vi.mock('@/lib/utils/production-units', () => ({
    getEnteredQuantityDisplay: () => '1 pcs',
    getEnteredUnitPriceDisplay: () => ({ price: 100000, unit: 'pcs' }),
}));

vi.mock('../EditSalesInvoiceDueDateDialog', () => ({
    EditSalesInvoiceDueDateDialog: ({ invoice }: any) => (
        <div data-testid="edit-due-dialog">
            Edit Jatuh Tempo Dialog — {invoice.invoiceNumber}
        </div>
    ),
}));

import { FinancialInvoiceDetail } from '../FinancialInvoiceDetail';

type InvoiceStatusType =
    | 'DRAFT'
    | 'UNPAID'
    | 'PARTIAL'
    | 'PAID'
    | 'OVERDUE'
    | 'CANCELLED'
    | 'PARTIALLY_PAID';

function makeInvoice(overrides: Partial<Record<string, unknown>> = {}) {
    const base = {
        id: 'inv-1',
        invoiceNumber: 'INV/2026/0001',
        invoiceDate: new Date('2026-08-01'),
        dueDate: new Date('2026-08-15'),
        status: 'DRAFT' as InvoiceStatusType,
        totalAmount: 1000000 as unknown,
        paidAmount: 0 as unknown,
        salesOrder: {
            orderNumber: 'SO-0001',
            orderType: 'STANDARD',
            customer: { name: 'Customer A' },
            taxAmount: 0 as unknown,
            entrySource: 'STANDARD',
            commercialReviewStatus: 'APPROVED',
            sourceReference: null,
            items: [
                {
                    id: 'item-1',
                    quantity: 10,
                    unitPrice: 100000,
                    subtotal: 1000000,
                    taxAmount: 0,
                    enteredQuantity: 10,
                    enteredUnit: 'pcs',
                    enteredUnitPrice: 100000,
                    productVariant: {
                        name: 'Variant A',
                        product: { name: 'Product A' },
                    },
                },
            ],
        },
    };
    return { ...base, ...overrides } as unknown as React.ComponentProps<
        typeof FinancialInvoiceDetail
    >['invoice'];
}

describe('FinancialInvoiceDetail — Konfirmasi Invoice button', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateInvoiceStatus.mockResolvedValue({ success: true });
        mockRecordCustomerPayment.mockResolvedValue({ success: true });
    });

    it('shows Konfirmasi Invoice when status DRAFT', () => {
        render(<FinancialInvoiceDetail invoice={makeInvoice({ status: 'DRAFT' })} />);
        expect(
            screen.getByRole('button', { name: /Konfirmasi Invoice/i }),
        ).toBeDefined();
    });

    it('does NOT show Konfirmasi Invoice when status UNPAID', () => {
        render(
            <FinancialInvoiceDetail invoice={makeInvoice({ status: 'UNPAID' })} />,
        );
        expect(
            screen.queryByRole('button', { name: /Konfirmasi Invoice/i }),
        ).toBeNull();
    });

    it('does NOT show Konfirmasi Invoice when status PAID', () => {
        render(<FinancialInvoiceDetail invoice={makeInvoice({ status: 'PAID' })} />);
        expect(
            screen.queryByRole('button', { name: /Konfirmasi Invoice/i }),
        ).toBeNull();
    });

    it('does NOT show Konfirmasi Invoice when status CANCELLED', () => {
        render(
            <FinancialInvoiceDetail invoice={makeInvoice({ status: 'CANCELLED' })} />,
        );
        expect(
            screen.queryByRole('button', { name: /Konfirmasi Invoice/i }),
        ).toBeNull();
    });

    it('calls updateInvoiceStatus with correct payload and refreshes', async () => {
        render(<FinancialInvoiceDetail invoice={makeInvoice({ status: 'DRAFT' })} />);

        const btn = screen.getByRole('button', { name: /Konfirmasi Invoice/i });
        fireEvent.click(btn);

        await waitFor(() => {
            expect(mockUpdateInvoiceStatus).toHaveBeenCalledWith({
                id: 'inv-1',
                status: 'UNPAID',
            });
        });

        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalled();
            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    it('shows error toast when updateInvoiceStatus returns failure', async () => {
        mockUpdateInvoiceStatus.mockResolvedValue({
            success: false,
            error: 'Gagal',
        });

        render(<FinancialInvoiceDetail invoice={makeInvoice({ status: 'DRAFT' })} />);

        fireEvent.click(
            screen.getByRole('button', { name: /Konfirmasi Invoice/i }),
        );

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalled();
        });
    });
});

describe('FinancialInvoiceDetail — Catat Pembayaran button', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateInvoiceStatus.mockResolvedValue({ success: true });
        mockRecordCustomerPayment.mockResolvedValue({ success: true });
    });

    it('shows Catat Pembayaran for DRAFT status', () => {
        render(<FinancialInvoiceDetail invoice={makeInvoice({ status: 'DRAFT' })} />);
        expect(
            screen.getByRole('button', { name: /Catat Pembayaran/i }),
        ).toBeDefined();
    });

    it('shows Catat Pembayaran for UNPAID status', () => {
        render(
            <FinancialInvoiceDetail invoice={makeInvoice({ status: 'UNPAID' })} />,
        );
        expect(
            screen.getByRole('button', { name: /Catat Pembayaran/i }),
        ).toBeDefined();
    });

    it('does NOT show Catat Pembayaran for PAID status', () => {
        render(<FinancialInvoiceDetail invoice={makeInvoice({ status: 'PAID' })} />);
        expect(
            screen.queryByRole('button', { name: /Catat Pembayaran/i }),
        ).toBeNull();
    });

    it('does NOT show Catat Pembayaran for CANCELLED status', () => {
        render(
            <FinancialInvoiceDetail invoice={makeInvoice({ status: 'CANCELLED' })} />,
        );
        expect(
            screen.queryByRole('button', { name: /Catat Pembayaran/i }),
        ).toBeNull();
    });

    it('opens dialog and calls recordCustomerPayment on confirm', async () => {
        render(
            <FinancialInvoiceDetail invoice={makeInvoice({ status: 'UNPAID' })} />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: /Catat Pembayaran/i }),
        );

        // Dialog should now be open
        await waitFor(() => {
            expect(screen.getByText('Catat Pembayaran', { selector: '[data-slot="dialog-title"]' } as unknown as object) || screen.getAllByText(/Catat Pembayaran/i).length).toBeTruthy();
        });

        const confirmButtons = screen.getAllByRole('button', {
            name: /Konfirmasi Pembayaran/i,
        });
        // There might be one inside dialog, click first that is enabled
        const dialogConfirm = confirmButtons.find(
            (b) => !b.hasAttribute('disabled') || b.getAttribute('disabled') === null,
        ) ?? confirmButtons[0];

        fireEvent.click(dialogConfirm);

        await waitFor(() => {
            expect(mockRecordCustomerPayment).toHaveBeenCalled();
        });

        const callArg = mockRecordCustomerPayment.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(callArg.invoiceId).toBe('inv-1');
        expect(callArg.amount).toBe(1000000);
        expect(callArg.method).toBeDefined();
    });

    it('defaults payment date to today and sends chosen date to recordCustomerPayment', async () => {
        render(
            <FinancialInvoiceDetail invoice={makeInvoice({ status: 'UNPAID' })} />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: /Catat Pembayaran/i }),
        );

        const dateInput = (await screen.findByLabelText(
            /Tanggal Pembayaran/i,
        )) as HTMLInputElement;
        expect(dateInput.value).toBe(
            new Date().toISOString().split('T')[0],
        );

        fireEvent.change(dateInput, { target: { value: '2026-08-01' } });

        const confirmButtons = screen.getAllByRole('button', {
            name: /Konfirmasi Pembayaran/i,
        });
        const dialogConfirm =
            confirmButtons.find(
                (b) =>
                    !b.hasAttribute('disabled') ||
                    b.getAttribute('disabled') === null,
            ) ?? confirmButtons[0];

        fireEvent.click(dialogConfirm);

        await waitFor(() => {
            expect(mockRecordCustomerPayment).toHaveBeenCalled();
        });

        const callArg = mockRecordCustomerPayment.mock.calls[0]?.[0] as Record<
            string,
            unknown
        >;
        const sentDate = callArg.paymentDate as Date;
        expect(sentDate.toISOString().split('T')[0]).toBe('2026-08-01');
    });

    it('updated note says status & pembayaran bisa dari halaman ini, not read-only only', () => {
        render(<FinancialInvoiceDetail invoice={makeInvoice({ status: 'UNPAID' })} />);
        expect(
            screen.getByText(/Status invoice dan pembayaran sudah bisa dikelola/i),
        ).toBeDefined();
        expect(
            screen.queryByText(/This is a read-only financial view/i),
        ).toBeNull();
    });

    it('print buttons still exist', () => {
        render(<FinancialInvoiceDetail invoice={makeInvoice()} />);
        expect(
            screen.getByRole('button', { name: /Cetak Dot Matrix/i }),
        ).toBeDefined();
        // ESC/P link containing text
        expect(screen.getByText(/ESC\/P/i)).toBeDefined();
    });
});

describe('FinancialInvoiceDetail — Edit Jatuh Tempo button', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateInvoiceStatus.mockResolvedValue({ success: true });
        mockRecordCustomerPayment.mockResolvedValue({ success: true });
    });

    const editableStatuses: InvoiceStatusType[] = [
        'DRAFT',
        'UNPAID',
        'PARTIAL',
        'OVERDUE',
    ];
    const nonEditableStatuses: InvoiceStatusType[] = ['PAID', 'CANCELLED'];

    it.each(editableStatuses)(
        'shows Edit Jatuh Tempo for status %s',
        (status) => {
            render(
                <FinancialInvoiceDetail
                    invoice={makeInvoice({ status } as any)}
                />,
            );
            expect(
                screen.getByRole('button', { name: /Edit Jatuh Tempo/i }),
            ).toBeDefined();
        },
    );

    it.each(nonEditableStatuses)(
        'does NOT show Edit Jatuh Tempo for status %s',
        (status) => {
            render(
                <FinancialInvoiceDetail
                    invoice={makeInvoice({ status } as any)}
                />,
            );
            expect(
                screen.queryByRole('button', { name: /Edit Jatuh Tempo/i }),
            ).toBeNull();
        },
    );

    it('clicking Edit Jatuh Tempo opens EditSalesInvoiceDueDateDialog', async () => {
        render(
            <FinancialInvoiceDetail
                invoice={makeInvoice({ status: 'UNPAID' })}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: /Edit Jatuh Tempo/i }),
        );

        await waitFor(() => {
            expect(screen.getByTestId('edit-due-dialog')).toBeDefined();
        });

        expect(
            screen.getByText(/Edit Jatuh Tempo Dialog/),
        ).toBeDefined();
        expect(
            screen.getByTestId('edit-due-dialog').textContent,
        ).toContain('INV/2026/0001');
    });

    it('does NOT render dialog until button clicked', () => {
        render(
            <FinancialInvoiceDetail
                invoice={makeInvoice({ status: 'UNPAID' })}
            />,
        );
        expect(screen.queryByTestId('edit-due-dialog')).toBeNull();
    });

    it('shows Edit Jatuh Tempo for PARTIALLY_PAID? delegates to non-editable logic if not in allowed list - check DRAFT still works', () => {
        // PARTIALLY_PAID is legacy naming; component guards PAID/CANCELLED only, so PARTIALLY_PAID should still show button
        // If product uses PARTIAL enum, we already covered; this checks PARTIALLY_PAID fallback (guard only blocks PAID/CANCELLED)
        render(
            <FinancialInvoiceDetail
                invoice={makeInvoice({ status: 'PARTIALLY_PAID' } as any)}
            />,
        );
        // Component checks !== 'PAID' && !== 'CANCELLED', so PARTIALLY_PAID shows button
        expect(
            screen.getByRole('button', { name: /Edit Jatuh Tempo/i }),
        ).toBeDefined();
    });
});
