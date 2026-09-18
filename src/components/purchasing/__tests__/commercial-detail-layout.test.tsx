// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PurchaseOrderDetailClient } from '../orders/PurchaseOrderDetailClient';
import { PurchaseReturnDetailClient } from '../PurchaseReturnDetailClient';
import { SalesReturnDetailClient } from '@/components/sales/SalesReturnDetailClient';
import { FinancialPurchaseInvoiceDetail } from '@/components/finance/invoices/FinancialPurchaseInvoiceDetail';
import { makePurchaseOrder, makePurchaseReturn, makeSalesReturn, makePurchaseInvoice, purchaseItem } from './commercial-detail-fixtures';

// Keep complete components and UI primitives real; no backend/network in layout tests.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({ EntityStatusTimeline: () => null }));
vi.mock('@/actions/purchasing/purchasing', () => ({ updatePurchaseOrderStatus: vi.fn(), createPurchaseInvoice: vi.fn(), deletePurchaseOrder: vi.fn() }));
vi.mock('@/actions/purchasing/purchase-returns', () => ({ confirmPurchaseReturnAction: vi.fn(), shipPurchaseReturnAction: vi.fn(), completePurchaseReturnAction: vi.fn(), cancelPurchaseReturnAction: vi.fn() }));
vi.mock('@/actions/sales/sales-returns', () => ({ confirmSalesReturnAction: vi.fn(), receiveSalesReturnAction: vi.fn(), completeSalesReturnAction: vi.fn(), cancelSalesReturnAction: vi.fn() }));
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network in layout test'); })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function checkScrollRegion(name: string) {
    const region = screen.getByRole('region', { name });
    expect(region.tabIndex).toBe(0);
    expect(region.classList.contains('overflow-x-auto')).toBe(true);
    expect(region.classList.contains('overflow-hidden')).toBe(false);
    expect(region.classList.contains('focus-visible:ring-2')).toBe(true);
    expect(within(region).getByRole('table')).toBeTruthy();
}
function normalized(element: Element) { return element.textContent?.replace(/\s/g, ''); }

describe('PO table column alignment', () => {
    it.each([
        { name: 'no tax', percent: null, amount: null, columns: 5 },
        { name: 'zero tax', percent: 0, amount: 0, columns: 5 },
        { name: 'percent only', percent: 11, amount: 0, columns: 6 },
        { name: 'amount only', percent: 0, amount: 660_000, columns: 6 },
        { name: 'both fields', percent: 11, amount: 660_000, columns: 6 },
    ])('aligns all summaries for $name without changing displayed values', ({ percent, amount, columns }) => {
        const taxedItem = { ...purchaseItem, id: 'taxed-item',
            taxPercent: percent === null ? null : new Prisma.Decimal(percent),
            taxAmount: amount === null ? null : new Prisma.Decimal(amount), dppOtherAmount: 6_000_000,
        };
        render(<PurchaseOrderDetailClient order={makePurchaseOrder({
            items: [purchaseItem, taxedItem], taxAmount: new Prisma.Decimal(660_000), totalAmount: 12_710_000,
        })} />);
        const table = screen.getByRole<HTMLTableElement>('table');
        expect(table.tHead!.rows[0].cells).toHaveLength(columns);
        for (const row of Array.from(table.tBodies[0].rows)) expect(row.cells).toHaveLength(columns);
        const rows = Array.from(table.tFoot!.rows);
        expect(rows).toHaveLength(4);
        for (const row of rows) {
            expect(row.cells[0].colSpan).toBe(columns - 1);
            expect(row.cells[1].colSpan).toBe(1);
        }
        expect(rows.map(row => normalized(row.cells[1]))).toEqual(['-Rp50.000', 'Rp660.000', 'Rp100.000', 'Rp12.710.000']);
        checkScrollRegion('Rincian item pembelian');
    });

    it('keeps an empty zero-value order at five columns and hides unused adjustments', () => {
        render(<PurchaseOrderDetailClient order={makePurchaseOrder({ items: [], totalAmount: null, discountAmount: null, shippingCost: null })} />);
        const table = screen.getByRole<HTMLTableElement>('table');
        expect(table.tFoot!.rows).toHaveLength(1);
        expect(table.tFoot!.rows[0].cells[0].colSpan).toBe(4);
        expect(normalized(table.tFoot!.rows[0].cells[1])).toBe('Rp0');
    });

    it('keeps warehouse quantities and hides commercial columns and totals', () => {
        render(<PurchaseOrderDetailClient warehouseMode order={makePurchaseOrder({ items: [{ ...purchaseItem, taxPercent: new Prisma.Decimal(11) }] })} />);
        const table = screen.getByRole<HTMLTableElement>('table');
        expect(table.tHead!.rows[0].cells).toHaveLength(3);
        expect(table.tBodies[0].rows[0].cells).toHaveLength(3);
        expect(table.tFoot).toBeNull();
        expect(screen.queryByText('Total Keseluruhan')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Tandai Terkirim' })).toBeNull();
        checkScrollRegion('Rincian item pembelian');
    });
});

describe('return detail table layout', () => {
    it.each(['sales', 'purchase'] as const)('preserves %s return amounts in a keyboard-scrollable region', kind => {
        render(kind === 'sales' ? <SalesReturnDetailClient salesReturn={makeSalesReturn()} /> : <PurchaseReturnDetailClient purchaseReturn={makePurchaseReturn()} />);
        const table = screen.getByRole<HTMLTableElement>('table');
        const rows = table.tBodies[0].rows;
        expect(table.tHead!.rows[0].cells).toHaveLength(5);
        expect(rows[1].cells[0].colSpan).toBe(4);
        expect(normalized(rows[0].cells[4])).toBe('Rp6.000.000');
        expect(normalized(rows[1].cells[1])).toBe('Rp6.000.000');
        expect(rows[1].cells[1].classList.contains('whitespace-nowrap')).toBe(true);
        expect(screen.getByRole('button', { name: 'Konfirmasi Retur' })).toBeTruthy();
        checkScrollRegion(kind === 'sales' ? 'Item retur penjualan' : 'Item retur pembelian');
    });
    it.each(['sales', 'purchase'] as const)('preserves %s return empty/null display', kind => {
        render(kind === 'sales' ? <SalesReturnDetailClient salesReturn={makeSalesReturn({ items: [], totalAmount: null })} /> : <PurchaseReturnDetailClient purchaseReturn={makePurchaseReturn({ items: [], totalAmount: null })} />);
        const table = screen.getByRole<HTMLTableElement>('table');
        expect(table.tBodies[0].rows).toHaveLength(1);
        expect(normalized(table.tBodies[0].rows[0].cells[1])).toBe('-');
    });
});

describe('financial purchase invoice table layout', () => {
    it('keeps total aligned with subtotal and leaves payment summary unchanged', () => {
        render(<FinancialPurchaseInvoiceDetail invoice={makePurchaseInvoice({ paidAmount: 1_000_000 })} />);
        const table = screen.getByRole<HTMLTableElement>('table');
        expect(table.tHead!.rows[0].cells).toHaveLength(5);
        expect(table.tFoot!.rows[0].cells[0].colSpan).toBe(4);
        expect(normalized(table.tFoot!.rows[0].cells[1])).toBe('Rp6.000.000');
        expect(table.tFoot!.rows[0].cells[1].classList.contains('whitespace-nowrap')).toBe(true);
        expect(screen.getByText(/Rp\s*5\.000\.000/)).toBeTruthy();
        checkScrollRegion('Rincian invoice pembelian');
    });
    it('preserves the existing empty-item summary without an empty table', () => {
        const invoice = makePurchaseInvoice();
        render(<FinancialPurchaseInvoiceDetail invoice={{ ...invoice, purchaseOrder: { ...invoice.purchaseOrder, items: [] } }} />);
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.getByText('Purchase Order Total')).toBeTruthy();
    });
});
