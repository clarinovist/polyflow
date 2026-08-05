// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DeliveryOrderDetail } from '../DeliveryOrderDetail';
import { salesLabels } from '@/lib/labels';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const mockUpdateDeliveryItemQuantities = vi.fn();
const mockFetchDeliveryStockReadiness = vi.fn();
const mockUpdateDeliveryStatus = vi.fn();

vi.mock('@/actions/inventory/deliveries', () => ({
    updateDeliveryItemQuantities: (...args: unknown[]) =>
        mockUpdateDeliveryItemQuantities(...args),
    fetchDeliveryStockReadiness: (...args: unknown[]) =>
        mockFetchDeliveryStockReadiness(...args),
    updateDeliveryStatus: (...args: unknown[]) =>
        mockUpdateDeliveryStatus(...args),
}));

vi.mock('@/actions/sales/delivery-photos', () => ({
    attachDeliveryPhoto: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@/components/warehouse/outgoing/LoadVerifyPanel', () => ({
    LoadVerifyPanel: () => null,
}));

vi.mock('@/components/shared/EntityStatusTimeline', () => ({
    EntityStatusTimeline: () => null,
}));

vi.mock('@/components/sales/StockReadinessBanner', () => ({
    StockReadinessBanner: () => null,
}));

vi.mock('@/components/sales/EditDeliveryPricingDialog', () => ({
    EditDeliveryPricingDialog: () => null,
}));

vi.mock('@/components/warehouse/WarehouseAttachmentPanel', () => ({
    WarehouseAttachmentPanel: () => null,
}));

vi.mock('@/components/ui/print-preview-modal', () => ({
    PrintPreviewModal: () => null,
}));

vi.mock('@/components/sales/SuratJalanDotMatrixPrint', () => ({
    SuratJalanDotMatrixPrint: () => null,
}));

vi.mock('@/lib/media/compress-image', () => ({
    compressImageForUpload: vi.fn(),
}));

vi.mock('@/lib/utils/production-units', () => ({
    getEnteredQuantityDisplay: vi.fn(),
}));

import type { DeliveryOrderDetailData } from '../DeliveryOrderDetail';

function makeOrder(
    overrides: Partial<DeliveryOrderDetailData> = {},
): DeliveryOrderDetailData {
    return {
        id: 'do-1',
        orderNumber: 'DO-2026-0001',
        salesOrderId: 'so-1',
        status: 'PENDING',
        deliveryDate: '2026-08-01',
        items: [
            {
                id: 'item-1',
                quantity: 100,
                productVariant: {
                    name: 'Product A',
                    skuCode: 'SKU-A',
                    primaryUnit: 'pcs',
                    product: { name: 'Parent A' },
                },
            },
        ],
        salesOrder: {
            orderNumber: 'SO-2026-0001',
            customer: { name: 'Customer A' },
        },
        ...overrides,
    };
}

describe('DeliveryOrderDetail — qty mismatch dialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchDeliveryStockReadiness.mockResolvedValue({
            success: true,
            data: [],
        });
    });

    it('shows directed dialog when result code is DO_QTY_EXCEEDS_SO_RESIDUAL', async () => {
        mockUpdateDeliveryItemQuantities.mockResolvedValue({
            success: false,
            error: 'Qty melebihi sisa SO yang belum terkirim (maks 9750).',
            code: 'DO_QTY_EXCEEDS_SO_RESIDUAL',
            details: {
                requested: 10050,
                maxAllowed: 9750,
                soQty: 10000,
                delivered: 250,
            },
        });

        render(<DeliveryOrderDetail order={makeOrder()} />);

        fireEvent.click(screen.getByText(salesLabels.editSjQty));

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '10050' } });

        fireEvent.click(screen.getByText(salesLabels.saveSjQty));

        await waitFor(() => {
            expect(screen.getByText('Qty melebihi sisa SO')).toBeDefined();
        });

        expect(screen.getByText(/10050/)).toBeDefined();
        expect(screen.getByText(/9750/)).toBeDefined();
        expect(screen.getAllByText(/SO-2026-0001/).length).toBeGreaterThanOrEqual(1);

        expect(screen.getByText('Tutup')).toBeDefined();
        expect(screen.getByText('Buka Sales Order')).toBeDefined();
    });

    it('falls back to toast.error for other error codes', async () => {
        const { toast } = await import('sonner');

        mockUpdateDeliveryItemQuantities.mockResolvedValue({
            success: false,
            error: 'Terjadi kesalahan',
            code: 'INTERNAL_ERROR',
        });

        render(<DeliveryOrderDetail order={makeOrder()} />);

        fireEvent.click(screen.getByText(salesLabels.editSjQty));

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '50' } });

        fireEvent.click(screen.getByText(salesLabels.saveSjQty));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Terjadi kesalahan');
        });

        expect(screen.queryByText('Qty melebihi sisa SO')).toBeNull();
    });

    it('shows warehouse-specific copy in warehouseMode', async () => {
        mockUpdateDeliveryItemQuantities.mockResolvedValue({
            success: false,
            error: 'Qty melebihi sisa SO yang belum terkirim (maks 9750).',
            code: 'DO_QTY_EXCEEDS_SO_RESIDUAL',
            details: {
                requested: 10050,
                maxAllowed: 9750,
                soQty: 10000,
                delivered: 250,
            },
        });

        render(<DeliveryOrderDetail order={makeOrder()} warehouseMode />);

        fireEvent.click(screen.getByText(salesLabels.editSjQty));

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '10050' } });

        fireEvent.click(screen.getByText(salesLabels.saveSjQty));

        await waitFor(() => {
            expect(screen.getByText('Qty melebihi sisa SO')).toBeDefined();
        });

        expect(
            screen.getByText(/Hubungi sales untuk mengubah qty/),
        ).toBeDefined();
        expect(screen.getByText('Lihat Sales Order')).toBeDefined();
    });
});
