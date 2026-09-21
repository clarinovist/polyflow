import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: vi.fn(), proposal: vi.fn(), receive: vi.fn(), credit: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.db }));
vi.mock('../return-credit-proposal-service', () => ({ prepareNewReturnCreditProposal: mocks.proposal }));
vi.mock('../sales-return-receipt-service', () => ({ receiveReturnInTransaction: mocks.receive }));
vi.mock('../manual-return-credit-service', () => ({ postManualReturnCreditInTransaction: mocks.credit }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
import { getQuickReturnOrderItems, getQuickReturnOrders, postQuickSalesReturn, previewQuickSalesReturn } from '../quick-sales-return-service';
const d = (value: number) => new Prisma.Decimal(value);
const selection = { salesOrderId: 'order', items: [{ productVariantId: 'variant', quantity: '2' }] };
const source = { id: 'movement', productVariantId: 'variant', quantity: d(10), fromLocationId: 'location', fromLocation: { id: 'location', name: 'Finished goods', locationType: 'INTERNAL', locationPurpose: 'FINISHED_GOOD' } };
const item = { productVariantId: 'variant', unitPrice: d(125), productVariant: { name: 'Synthetic', skuCode: 'SKU', primaryUnit: 'KG', product: { productType: 'FINISHED_GOOD' } } };
const order = { id: 'order', customerId: 'customer', orderType: 'MAKE_TO_STOCK', status: 'DELIVERED', items: [item] };
const tx = {
    $queryRaw: vi.fn(),
    salesOrder: { findUnique: vi.fn(), findMany: vi.fn() },
    stockMovement: { findMany: vi.fn() },
    salesReturnReceiptLine: { aggregate: vi.fn() },
    payment: { aggregate: vi.fn() },
    invoice: { findUniqueOrThrow: vi.fn() },
    salesReturn: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const db = { ...tx, $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
const requestId = '6ea38d39-b362-40bb-a29b-0649b1f5f182';
async function command() { return { selection, requestId, fingerprint: (await previewQuickSalesReturn(selection)).fingerprint, confirmed: true }; }
describe('quick return orchestration (DB lock/rollback evidence is in PostgreSQL contract suite)', () => {
    beforeEach(() => {
        vi.clearAllMocks(); mocks.db.mockReturnValue(db);
        tx.salesOrder.findUnique.mockResolvedValue(order);
        tx.salesOrder.findMany.mockResolvedValue([{ id: 'order', orderNumber: 'SO-TEST' }]);
        tx.stockMovement.findMany.mockResolvedValue([source]);
        tx.salesReturnReceiptLine.aggregate.mockResolvedValue({ _sum: { quantity: null } });
        tx.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
        tx.invoice.findUniqueOrThrow.mockResolvedValue({ paidAmount: d(0) });
        tx.salesReturn.findUnique.mockResolvedValue(null);
        tx.salesReturn.create.mockImplementation(async ({ data }) => ({ id: data.id, returnNumber: data.returnNumber, items: data.items.create }));
        mocks.proposal.mockResolvedValue({ ready: true, invoiceId: 'invoice', fingerprint: 'a'.repeat(64), invoiceNumber: 'INV-TEST', orderNumber: 'SO-TEST', totalAmount: '222.00', taxAmount: '22.00', remaining: '1110.00', remainingAfter: '888.00', source: 'SNAPSHOT' });
        mocks.receive.mockResolvedValue({}); mocks.credit.mockResolvedValue({}); mocks.audit.mockResolvedValue(undefined);
    });
    it('read-only preview derives monetary source and internal warehouse, normalized input', async () => {
        const result = await previewQuickSalesReturn({ ...selection, items: [{ productVariantId: 'variant', quantity: '2.0000' }] });
        expect(result).toMatchObject({ totalAmount: '222.00', locationName: 'Finished goods', items: [{ productVariantId: 'variant', quantity: '2', name: 'Synthetic', unit: 'KG' }] });
        expect(tx.salesReturn.create).not.toHaveBeenCalled(); expect(mocks.receive).not.toHaveBeenCalled();
    });
    it('passes same transaction into receipt, credit and critical audit in order', async () => {
        const input = await command();
        await postQuickSalesReturn(input, 'actor');
        expect(mocks.receive).toHaveBeenCalledWith(tx, expect.objectContaining({ returnId: requestId, lines: [{ returnItemId: expect.any(String), sourceMovementId: 'movement' }] }), 'actor');
        expect(mocks.credit).toHaveBeenCalledWith(tx, expect.objectContaining({ returnId: requestId, invoiceId: 'invoice', totalAmount: '222.00', taxAmount: '22.00', expectedRemaining: '1110.00', confirmed: true }), 'actor');
        expect(mocks.receive.mock.invocationCallOrder[0]).toBeLessThan(mocks.credit.mock.invocationCallOrder[0]);
        expect(tx.salesReturn.update).toHaveBeenCalledWith({ where: { id: requestId }, data: { status: 'COMPLETED' } });
        expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'COMPLETE_SALES_RETURN', tx }));
        expect(db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { timeout: 15000 });
    });
    it('identical retry returns the posted result without running receipt or credit again', async () => {
        const input = await command(); const result = await postQuickSalesReturn(input, 'actor');
        const evidence = mocks.credit.mock.calls[0][1].evidence;
        tx.salesReturn.findUnique.mockResolvedValue({ ...result, createdById: 'actor', salesOrderId: 'order', credit: { status: 'POSTED', evidenceReference: evidence } });
        mocks.receive.mockClear(); mocks.credit.mockClear();
        expect(await postQuickSalesReturn(input, 'actor')).toEqual(result);
        expect(mocks.receive).not.toHaveBeenCalled(); expect(mocks.credit).not.toHaveBeenCalled();
        await expect(postQuickSalesReturn(input, 'another-actor')).rejects.toThrow(/berbeda/);
    });
    it('rejects stale quote before creating the document', async () => {
        const input = await command(); mocks.proposal.mockResolvedValue({ ...(await mocks.proposal()), fingerprint: 'b'.repeat(64) });
        await expect(postQuickSalesReturn(input, 'actor')).rejects.toThrow(/berubah/);
        expect(tx.salesReturn.create).not.toHaveBeenCalled();
    });
    it.each(['receive', 'credit', 'audit'] as const)('propagates %s failure out of transaction, never swallows partial failure', async key => {
        const input = await command(); mocks[key].mockRejectedValueOnce(new Error('injected failure'));
        await expect(postQuickSalesReturn(input, 'actor')).rejects.toThrow('injected failure');
        expect(tx.salesReturn.update).not.toHaveBeenCalled();
    });
    it('requires explicit tenant and rejects unknown/invalid orders', async () => {
        mocks.db.mockReturnValue(null); await expect(previewQuickSalesReturn(selection)).rejects.toThrow(/tenant/);
        mocks.db.mockReturnValue(db); tx.salesOrder.findUnique.mockResolvedValue(null);
        await expect(previewQuickSalesReturn(selection)).rejects.toThrow();
        for (const change of [{ customerId: null }, { orderType: 'MAKLON_JASA' }, { status: 'CANCELLED' }]) {
            tx.salesOrder.findUnique.mockResolvedValue({ ...order, ...change }); await expect(previewQuickSalesReturn(selection)).rejects.toThrow(/SO\/customer/);
        }
    });
    it('rejects duplicate/non-finished products and ambiguous/missing shipments', async () => {
        tx.salesOrder.findUnique.mockResolvedValue({ ...order, items: [item, item] });
        await expect(previewQuickSalesReturn(selection)).rejects.toThrow(/satu baris SO/);
        tx.salesOrder.findUnique.mockResolvedValue(order);
        for (const movements of [[], [source, source], Array(201).fill(source)]) {
            tx.stockMovement.findMany.mockResolvedValue(movements); await expect(previewQuickSalesReturn(selection)).rejects.toThrow(/pengiriman|Pengiriman/);
        }
    });
    it('rejects external warehouse, excessive qty, phantom payments, and blocked proposal', async () => {
        tx.stockMovement.findMany.mockResolvedValue([{ ...source, fromLocation: { ...source.fromLocation, locationType: 'CUSTOMER_OWNED' } }]);
        await expect(previewQuickSalesReturn(selection)).rejects.toThrow(/internal/);
        tx.stockMovement.findMany.mockResolvedValue([source]); tx.salesReturnReceiptLine.aggregate.mockResolvedValue({ _sum: { quantity: d(9) } });
        await expect(previewQuickSalesReturn(selection)).rejects.toThrow(/melebihi/);
        tx.salesReturnReceiptLine.aggregate.mockResolvedValue({ _sum: { quantity: null } }); tx.invoice.findUniqueOrThrow.mockResolvedValue({ paidAmount: d(1) });
        await expect(previewQuickSalesReturn(selection)).rejects.toThrow(/pembayaran/);
        mocks.proposal.mockResolvedValue({ ready: false, reason: 'Invoice lunas' }); await expect(previewQuickSalesReturn(selection)).rejects.toThrow('Invoice lunas');
    });
    it('returns bounded lookup fields and filters products to finished goods', async () => {
        expect(await getQuickReturnOrders('SO')).toHaveLength(1);
        expect(tx.salesOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, select: { id: true, orderNumber: true } }));
        expect(await getQuickReturnOrderItems('order')).toEqual([{ productVariantId: 'variant', name: 'Synthetic', skuCode: 'SKU', unit: 'KG' }]);
        tx.salesOrder.findUnique.mockResolvedValue(null); await expect(getQuickReturnOrderItems('foreign')).rejects.toThrow();
    });
});
