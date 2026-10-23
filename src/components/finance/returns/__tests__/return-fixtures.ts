import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';

export function returnFixture(overrides: Partial<FinanceReturnDetail> = {}): FinanceReturnDetail {
    return {
        id: 'return-example',
        returnNumber: 'SR-20261023-0001',
        returnDate: '2026-10-22T17:00:00.000Z',
        status: 'CONFIRMED',
        creditState: 'AWAITING_GOODS',
        totalAmount: 2380000,
        customer: { name: 'Pelanggan Contoh' },
        customerCredit: null,
        salesOrderId: 'order-example',
        salesOrder: { orderNumber: 'SO-2026-0100' },
        credit: null,
        reason: 'Harga perlu diperiksa',
        notes: 'Contoh sintetis untuk verifikasi UI.',
        deliveryOrder: null,
        returnLocation: { name: 'Gudang Barang Jadi' },
        items: [
            { id: 'item-a', productVariantId: 'variant-a', productVariant: { name: 'Rafia Hitam 0,2', skuCode: 'SKU-EXAMPLE-A' }, condition: 'GOOD', returnedQty: 20, unitPrice: 46000, receipt: null },
            { id: 'item-b', productVariantId: 'variant-b', productVariant: { name: 'Rafia Hitam 0,4', skuCode: 'SKU-EXAMPLE-B' }, condition: 'GOOD', returnedQty: 20, unitPrice: 73000, receipt: null },
        ],
        invoices: [{ id: 'invoice-example', invoiceNumber: 'INV-2026-0100', status: 'UNPAID', totalAmount: '11260000.00', paidAmount: '0.00', creditedAmount: '0.00', priceAdjustmentAmount: '0.00', remaining: '11260000.00', basis: [] }],
        ...overrides,
    };
}

export function creditFixture(overrides: Partial<NonNullable<FinanceReturnDetail['credit']>> = {}): NonNullable<FinanceReturnDetail['credit']> {
    return {
        status: 'POSTED', recoveryActive: false, recoveries: [], mode: 'MANUAL',
        approvalReason: 'Nominal sesuai bukti sintetis.', evidenceReference: 'EVIDENCE-EXAMPLE',
        approvedAt: '2026-10-22T17:00:00.000Z', approvedBy: 'Petugas Contoh', manualRemainingBefore: '11260000.00',
        taxAmount: '235856.00', reviewReason: null, totalAmount: '2380000.00',
        postedAt: '2026-10-22T17:00:00.000Z', reversedAt: null, reversalReason: null,
        allocations: [{ invoiceNumber: 'INV-2026-0100', quantity: null, totalAmount: '2380000.00' }],
        ...overrides,
    };
}
