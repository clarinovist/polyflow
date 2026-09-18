import type { ComponentProps } from 'react';
import { Prisma } from '@prisma/client';
import type { PurchaseOrderDetailClient } from '../orders/PurchaseOrderDetailClient';
import type { PurchaseReturnDetailClient } from '../PurchaseReturnDetailClient';
import type { SalesReturnDetailClient } from '@/components/sales/SalesReturnDetailClient';
import type { FinancialPurchaseInvoiceDetail } from '@/components/finance/invoices/FinancialPurchaseInvoiceDetail';

export type PurchaseOrderFixture = ComponentProps<typeof PurchaseOrderDetailClient>['order'];
export type SalesReturnFixture = ComponentProps<typeof SalesReturnDetailClient>['salesReturn'];
export type PurchaseReturnFixture = ComponentProps<typeof PurchaseReturnDetailClient>['purchaseReturn'];
export type PurchaseInvoiceFixture = ComponentProps<typeof FinancialPurchaseInvoiceDetail>['invoice'];
const date = new Date('2026-09-18T00:00:00Z');
const supplier: PurchaseOrderFixture['supplier'] = {
    id: 'fixture-supplier', name: 'Synthetic Supplier', code: 'SUP-TEST',
    phone: null, email: null, address: null, taxId: null, paymentTermDays: 30,
    bankName: null, bankAccount: null, notes: null, isActive: true,
    createdAt: date, updatedAt: date,
};
export const purchaseItem: PurchaseOrderFixture['items'][number] = {
    id: 'fixture-item', purchaseOrderId: 'fixture-po', productVariantId: 'fixture-variant',
    quantity: 200, unitPrice: 30_000, subtotal: 6_000_000, receivedQty: 0,
    discountPercent: null, taxPercent: null, taxAmount: null, dppOtherAmount: null, ppnMode: 'EXCLUDE',
    productVariant: { id: 'fixture-variant', name: 'Synthetic Product', skuCode: 'SAMPLE-ITEM-01', primaryUnit: 'KG' },
};
export function makePurchaseOrder(overrides: Partial<PurchaseOrderFixture> = {}): PurchaseOrderFixture {
    return {
        id: 'fixture-po', orderNumber: 'PO-TEST', supplierId: supplier.id, supplier,
        orderDate: date, expectedDate: null, createdAt: date, updatedAt: date,
        status: 'DRAFT', totalAmount: 6_050_000, discountAmount: new Prisma.Decimal(50_000),
        taxAmount: null, shippingCost: new Prisma.Decimal(100_000), deliveryAddress: null,
        notes: null, createdById: null, createdBy: null, entrySource: 'STANDARD',
        sourceReference: null, commercialReviewStatus: 'NOT_REQUIRED', idempotencyKey: null,
        items: [purchaseItem], goodsReceipts: [], invoices: [], ...overrides,
    };
}
const returnBase = {
    id: 'fixture-return', returnNumber: 'RET-TEST', returnDate: date,
    reason: null, notes: null, totalAmount: new Prisma.Decimal(6_000_000),
    createdById: null, createdBy: null, createdAt: date, updatedAt: date,
};
export function makeSalesReturn(overrides: Partial<SalesReturnFixture> = {}): SalesReturnFixture {
    return {
        ...returnBase, status: 'DRAFT', salesOrderId: 'fixture-so', deliveryOrderId: null,
        customerId: null, returnLocationId: 'fixture-location', customer: null,
        returnLocation: null, salesOrder: null, deliveryOrder: null,
        items: [{ id: 'fixture-return-item', condition: 'GOOD', returnedQty: '200', unitPrice: '30000', productVariant: {
            skuCode: 'SAMPLE-ITEM-01', product: { name: 'Synthetic Product' },
        } }], ...overrides,
    };
}
export function makePurchaseReturn(overrides: Partial<PurchaseReturnFixture> = {}): PurchaseReturnFixture {
    return {
        ...returnBase, status: 'DRAFT', purchaseOrderId: 'fixture-po', goodsReceiptId: null,
        supplierId: supplier.id, supplier, sourceLocationId: 'fixture-location',
        sourceLocation: null, purchaseOrder: null,
        items: [{ condition: 'GOOD', returnedQty: 200, unitCost: 30_000, productVariant: {
            skuCode: 'SAMPLE-ITEM-01', product: { name: 'Synthetic Product' },
        } }], ...overrides,
    };
}
export function makePurchaseInvoice(overrides: Partial<PurchaseInvoiceFixture> = {}): PurchaseInvoiceFixture {
    return {
        id: 'fixture-invoice', invoiceNumber: 'INV-TEST', invoiceDate: date,
        dueDate: null, status: 'UNPAID', totalAmount: 6_000_000, paidAmount: 0,
        purchaseOrder: { orderNumber: 'PO-TEST', supplier, totalAmount: 6_000_000, items: [{
            id: purchaseItem.id, quantity: 200, unitPrice: 30_000, subtotal: 6_000_000,
            productVariant: purchaseItem.productVariant,
        }] }, ...overrides,
    };
}
