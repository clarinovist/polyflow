// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/actions/purchasing/purchasing', () => ({ updatePurchaseOrderStatus: vi.fn(), createPurchaseInvoice: vi.fn(), deletePurchaseOrder: vi.fn() }));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({ EntityStatusTimeline: () => <div>Riwayat Status</div> }));
vi.mock('../ClosePurchaseOrderDialog', () => ({ ClosePurchaseOrderDialog: () => <button>Tutup PO</button> }));
import { PurchaseOrderDetailClient } from '../PurchaseOrderDetailClient';

type Order = ComponentProps<typeof PurchaseOrderDetailClient>['order'];
const base = {
    id: 'po', orderNumber: 'PO-TEST', orderDate: '2026-09-01', status: 'PARTIAL_RECEIVED',
    supplier: { name: 'Synthetic supplier' }, items: [], invoices: [], goodsReceipts: [],
} as unknown as Order;

describe('PO detail close entry point', () => {
    it('shows close for partial purchasing orders', () => {
        render(<PurchaseOrderDetailClient order={base} />);
        expect(screen.getByRole('button', { name: 'Tutup PO' })).toBeTruthy();
    });
    it('does not expose purchasing closure in warehouse mode', () => {
        render(<PurchaseOrderDetailClient order={base} warehouseMode />);
        expect(screen.queryByRole('button', { name: 'Tutup PO' })).toBeNull();
    });
    it.each(['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED', 'CLOSED'] as const)('does not show close for %s', status => {
        render(<PurchaseOrderDetailClient order={{ ...base, status }} />);
        expect(screen.queryByRole('button', { name: 'Tutup PO' })).toBeNull();
        if (status === 'CLOSED') {
            expect(screen.getByText('Ditutup')).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Edit PO' })).toBeNull();
            expect(screen.queryByRole('link', { name: /Penerimaan Barang/ })).toBeNull();
            expect(screen.getByRole('button', { name: 'Buat Invoice' })).toBeTruthy();
        }
    });
});
