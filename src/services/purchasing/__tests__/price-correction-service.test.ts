import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthorizationError, BusinessRuleError } from '@/lib/errors/errors';
import { getPurchasePriceCorrectionContext, postPurchasePriceCorrection, previewPurchasePriceCorrection } from '../price-correction-service';
import { calculatePoInvoiceTotalFromReceipts, createDraftBillFromPo } from '../invoices-service';
import { requireOpenJournalPeriod } from '@/services/finance/sales-recognition-service';
import { logActivity } from '@/lib/tools/audit';

const { tx, tenant } = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn(),
        purchaseInvoice: { findUnique: vi.fn(), findMany: vi.fn() },
        purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
        purchaseOrderItem: { update: vi.fn() },
        inventory: { findUnique: vi.fn(), update: vi.fn() },
        location: { findMany: vi.fn() },
        fixedAsset: { count: vi.fn() },
        atkCostEvidence: { count: vi.fn() },
        account: { count: vi.fn() },
        purchasePriceCorrection: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
        journalEntry: { create: vi.fn() },
        $transaction: vi.fn(),
    };
    return { tx, tenant: { available: true } };
});
vi.mock('@/lib/core/prisma', () => ({ prisma: tx, getTenantDbFromContext: () => tenant.available ? tx : undefined }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: vi.fn(async role => ({ id: role })) }));
vi.mock('@/services/accounting/account-mapping-policy', () => ({ resolveAccountCode: vi.fn(async () => ({ id: 'inventory-account' })) }));
vi.mock('@/services/accounting/journal-posting', () => ({ generateEntryNumber: vi.fn(async () => 'SYNTHETIC-JOURNAL') }));
vi.mock('@/services/finance/sales-recognition-service', () => ({ requireOpenJournalPeriod: vi.fn() }));
vi.mock('../invoices-service', () => ({ calculatePoInvoiceTotalFromReceipts: vi.fn(async () => 1000), createDraftBillFromPo: vi.fn() }));

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
function fixture() {
    const now = new Date('2026-10-30T03:00:00Z');
    const invoice = { id: 'bill', purchaseOrderId: 'po', invoiceDate: now, updatedAt: now, totalAmount: d(1000), paidAmount: d(0), status: 'UNPAID', notes: null as string | null };
    const item = { id: 'item', productVariantId: 'variant', quantity: d(10), receivedQty: d(10), unitPrice: d(100), discountPercent: d(0), taxPercent: d(0), taxAmount: d(0), ppnMode: 'EXCLUDE', dppOtherAmount: null, productVariant: { name: 'Synthetic material', skuCode: 'SYNTHETIC-MATERIAL', product: { productType: 'RAW_MATERIAL', inventoryAccountId: 'inventory-account' } } };
    const grItem = { id: 'gr-item', purchaseOrderItemId: 'item' as string | null, productVariantId: 'variant', receivedQty: d(10), unitCost: d(100) };
    const po = { id: 'po', updatedAt: now, status: 'RECEIVED', totalAmount: d(1000), taxAmount: d(0), shippingCost: null, invoices: [invoice], items: [item], goodsReceipts: [{ id: 'gr', locationId: 'location', isMaklon: false, items: [grItem] }] };
    const inventory = { id: 'stock', quantity: d(4), averageCost: d(100) };
    tx.purchaseInvoice.findUnique.mockImplementation(async () => invoice);
    tx.purchaseInvoice.findMany.mockImplementation(async () => [invoice]);
    tx.purchaseOrder.findUnique.mockImplementation(async () => po);
    tx.inventory.findUnique.mockImplementation(async () => inventory);
    vi.mocked(createDraftBillFromPo).mockImplementation(async () => {
        invoice.totalAmount = d(1200);
        return invoice as never;
    });
    return { invoice, po, item, grItem, inventory };
}
async function input() {
    const preview = await previewPurchasePriceCorrection({ invoiceId: 'bill', purchaseOrderItemId: 'item', newUnitPrice: '120' });
    return { invoiceId: 'bill', purchaseOrderItemId: 'item', newUnitPrice: '120', sourceFingerprint: preview.sourceFingerprint, reason: 'Koreksi harga sintetis', confirmed: true, idempotencyKey: '00000000-0000-4000-8000-000000000001' };
}

beforeEach(() => {
    vi.clearAllMocks();
    tenant.available = true;
    tx.$transaction.mockImplementation(async callback => callback(tx));
    tx.$queryRaw.mockResolvedValue([]);
    tx.fixedAsset.count.mockResolvedValue(0);
    tx.atkCostEvidence.count.mockResolvedValue(0);
    tx.location.findMany.mockResolvedValue([{ id: 'location', name: 'Gudang Sintetis' }]);
    tx.account.count.mockResolvedValue(3);
    tx.purchasePriceCorrection.findUnique.mockResolvedValue(null);
    tx.purchasePriceCorrection.findMany.mockResolvedValue([]);
    tx.purchasePriceCorrection.create.mockImplementation(async ({ data }) => data);
    tx.journalEntry.create.mockResolvedValue({ id: 'journal' });
    vi.mocked(requireOpenJournalPeriod).mockResolvedValue(undefined);
    vi.mocked(calculatePoInvoiceTotalFromReceipts).mockResolvedValue(1000);
    vi.mocked(logActivity).mockResolvedValue(undefined);
    fixture();
});

describe('purchase price correction service', () => {
    it('returns context/preview without writes', async () => {
        const context = await getPurchasePriceCorrectionContext('bill');
        expect(context).toHaveProperty('eligible', true);
        expect(context.items[0]).toMatchObject({ name: 'Synthetic material', skuCode: 'SYNTHETIC-MATERIAL', unitPrice: '100.0000', receivedQuantity: '10.0000' });
        expect(context.items[0]).toHaveProperty('receipts', [expect.objectContaining({ locationId: 'location', locationName: 'Gudang Sintetis', skuCode: 'SYNTHETIC-MATERIAL' })]);
        expect(context.items[0]).toHaveProperty('inventory', [expect.objectContaining({ locationId: 'location', locationName: 'Gudang Sintetis', skuCode: 'SYNTHETIC-MATERIAL' })]);
        const value = await previewPurchasePriceCorrection({ invoiceId: 'bill', purchaseOrderItemId: 'item', newUnitPrice: '120' });
        expect(value).toMatchObject({ receiptAmount: '200.00', inventoryAmount: '80.00', varianceAmount: '120.00', billTotalDelta: '200.00', billTaxDelta: '0.00' });
        expect(value).toMatchObject({ name: 'Synthetic material', skuCode: 'SYNTHETIC-MATERIAL', locations: [expect.objectContaining({ locationName: 'Gudang Sintetis', skuCode: 'SYNTHETIC-MATERIAL' })] });
        expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
        expect(tx.inventory.update).not.toHaveBeenCalled();
    });
    it.each(['paid', 'supplementary', 'maklon', 'asset', 'cancelled-po', 'ambiguous-receipt', 'bill-mismatch'])('keeps history for an ineligible %s context but rejects preview/post', async kind => {
        const { invoice, po, grItem } = fixture();
        const data = await input();
        const codes: Record<string, string> = { paid: 'BILL_PROTECTED', supplementary: 'BILL_AMBIGUOUS', maklon: 'MAKLON', asset: 'FIXED_ASSET', 'cancelled-po': 'INVALID_SOURCE', 'ambiguous-receipt': 'RECEIPT_AMBIGUOUS', 'bill-mismatch': 'BILL_MISMATCH' };
        if (kind === 'paid') { invoice.status = 'PAID'; invoice.paidAmount = d(1000); }
        if (kind === 'supplementary') invoice.notes = 'Suplementer: sintetis';
        if (kind === 'maklon') po.goodsReceipts[0].isMaklon = true;
        if (kind === 'asset') tx.fixedAsset.count.mockResolvedValue(1);
        if (kind === 'cancelled-po') po.status = 'CANCELLED';
        if (kind === 'ambiguous-receipt') grItem.purchaseOrderItemId = 'missing-item';
        if (kind === 'bill-mismatch') vi.mocked(calculatePoInvoiceTotalFromReceipts).mockResolvedValue(999);
        const history = [{ id: 'prior-correction', purchaseOrderItemId: 'item', reason: 'Koreksi sintetis sebelumnya' }];
        tx.purchasePriceCorrection.findMany.mockResolvedValue(history);
        const context = await getPurchasePriceCorrectionContext('bill');
        expect(context).toMatchObject({ eligible: false, invoiceId: 'bill', purchaseOrderId: 'po', reasonCode: `PURCHASE_PRICE_${codes[kind]}`, reasonMessage: expect.any(String), history });
        expect(context.items[0]).toMatchObject({ purchaseOrderItemId: 'item', name: 'Synthetic material', skuCode: 'SYNTHETIC-MATERIAL' });
        expect(context).not.toHaveProperty('sourceFingerprint');
        expect(tx.purchasePriceCorrection.findMany).toHaveBeenCalledWith({ where: { invoiceId: 'bill' }, orderBy: { createdAt: 'desc' }, take: 100 });
        await expect(previewPurchasePriceCorrection(data)).rejects.toMatchObject({ code: `PURCHASE_PRICE_${codes[kind]}`, message: context.eligible ? undefined : context.reasonMessage });
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toMatchObject({ code: `PURCHASE_PRICE_${codes[kind]}` });
        expect(tx.purchaseOrderItem.update).not.toHaveBeenCalled();
    });
    it('keeps ATK-protected receipt history read-only and rechecks before posting without mutations', async () => {
        const data = await input();
        tx.atkCostEvidence.count.mockResolvedValue(1);
        const history = [{ id: 'prior-correction', reason: 'Koreksi sintetis sebelumnya' }];
        tx.purchasePriceCorrection.findMany.mockResolvedValue(history);
        const context = await getPurchasePriceCorrectionContext('bill');
        expect(context).toMatchObject({ eligible: false, reasonCode: 'ATK_EVIDENCE_PROTECTED', history });
        expect(context).not.toHaveProperty('sourceFingerprint');
        await expect(previewPurchasePriceCorrection(data)).rejects.toMatchObject({ code: 'ATK_EVIDENCE_PROTECTED' });
        vi.clearAllMocks();
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toMatchObject({ code: 'ATK_EVIDENCE_PROTECTED' });
        expect(tx.atkCostEvidence.count).toHaveBeenCalledExactlyOnceWith({
            where: { movement: { goodsReceiptId: { in: ['gr'] } } },
        });
        expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(tx.atkCostEvidence.count.mock.invocationCallOrder[0]);
        expect(tx.purchaseOrderItem.update).not.toHaveBeenCalled();
        expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
        expect(createDraftBillFromPo).not.toHaveBeenCalled();
        expect(tx.inventory.update).not.toHaveBeenCalled();
        expect(tx.journalEntry.create).not.toHaveBeenCalled();
        expect(tx.purchasePriceCorrection.create).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });
    it.each(['invoice', 'po'])('keeps missing %s as a failure rather than ineligibility', async kind => {
        if (kind === 'invoice') tx.purchaseInvoice.findUnique.mockResolvedValue(null);
        else tx.purchaseOrder.findUnique.mockResolvedValue(null);
        await expect(getPurchasePriceCorrectionContext('bill')).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(tx.purchasePriceCorrection.findMany).not.toHaveBeenCalled();
    });
    it.each([new Error('Unexpected read failure'), new AuthorizationError(), new BusinessRuleError('Unrelated business failure')])('propagates non-eligibility errors: %s', async error => {
        tx.fixedAsset.count.mockRejectedValueOnce(error);
        await expect(getPurchasePriceCorrectionContext('bill')).rejects.toBe(error);
        expect(tx.purchasePriceCorrection.findMany).not.toHaveBeenCalled();
    });
    it('propagates history and display lookup failures', async () => {
        const failure = new Error('Unexpected lookup failure');
        tx.purchasePriceCorrection.findMany.mockRejectedValueOnce(failure);
        await expect(getPurchasePriceCorrectionContext('bill')).rejects.toBe(failure);
        tx.location.findMany.mockRejectedValueOnce(failure);
        await expect(getPurchasePriceCorrectionContext('bill')).rejects.toBe(failure);
    });
    it('does not add labels to the fingerprint or persisted posting evidence', async () => {
        const { item } = fixture();
        const data = await input();
        const before = await getPurchasePriceCorrectionContext('bill');
        item.productVariant.name = 'Bahan Sintetis Baru';
        item.productVariant.skuCode = 'SYNTHETIC-RENAMED';
        tx.location.findMany.mockResolvedValue([{ id: 'location', name: 'Gudang Sintetis Baru' }]);
        const after = await getPurchasePriceCorrectionContext('bill');
        const updated = await previewPurchasePriceCorrection(data);
        expect(before).toHaveProperty('sourceFingerprint', data.sourceFingerprint);
        expect(after).toHaveProperty('sourceFingerprint', data.sourceFingerprint);
        expect(updated.sourceFingerprint).toBe(data.sourceFingerprint);
        expect(updated.locations[0]).toHaveProperty('locationName', 'Gudang Sintetis Baru');
        const result = await postPurchasePriceCorrection(data, 'actor');
        const sourceEvidence = result.sourceEvidence;
        if (!sourceEvidence || typeof sourceEvidence !== 'object' || Array.isArray(sourceEvidence)) throw new Error('Expected source evidence object');
        const { accounts: _accounts, oldNetUnitCost: _oldNet, newNetUnitCost: _newNet, ...evidence } = sourceEvidence;
        expect(createHash('sha256').update(JSON.stringify(evidence)).digest('hex')).toBe(data.sourceFingerprint);
        expect(JSON.stringify(result.sourceEvidence)).not.toMatch(/locationName|skuCode|Synthetic material|Bahan Sintetis/);
        expect(JSON.stringify(result.locationAllocations)).not.toMatch(/locationName|skuCode/);
    });
    it('returns a null label for a missing location without changing the fingerprint', async () => {
        const data = await input();
        tx.location.findMany.mockResolvedValue([]);
        const value = await previewPurchasePriceCorrection(data);
        expect(value.locations[0]).toMatchObject({ locationId: 'location', locationName: null });
        expect(value.sourceFingerprint).toBe(data.sourceFingerprint);
    });
    it('locks, revalidates, synchronizes, revalues, and audits in one transaction', async () => {
        const data = await input();
        vi.clearAllMocks();
        const result = await postPurchasePriceCorrection(data, 'actor');
        expect(result).toMatchObject({ oldUnitPrice: '100.0000', newUnitPrice: '120.0000', receiptAmount: '200.00', inventoryAmount: '80.00', varianceAmount: '120.00', billNetDelta: '200.00', journalId: 'journal' });
        const sql = tx.$queryRaw.mock.calls.map(call => (call[0] as TemplateStringsArray).join('?'));
        expect(sql[0]).toContain('"PurchaseOrder"');
        expect(sql.some(query => query.includes('"Inventory"') && query.includes('FOR UPDATE'))).toBe(true);
        expect(tx.purchaseOrderItem.update.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createDraftBillFromPo).mock.invocationCallOrder[0]);
        expect(vi.mocked(createDraftBillFromPo).mock.invocationCallOrder[0]).toBeLessThan(tx.inventory.update.mock.invocationCallOrder[0]);
        expect(createDraftBillFromPo).toHaveBeenCalledWith('po', 'actor', { tx });
        expect(tx.inventory.update).toHaveBeenCalledWith({ where: { locationId_productVariantId: { locationId: 'location', productVariantId: 'variant' } }, data: { averageCost: '120.0000' } });
        const journal = tx.journalEntry.create.mock.calls[0][0].data;
        expect(journal.referenceType).toBe('MANUAL_ENTRY');
        expect(journal.reference).toBe(`PURCHASE_PRICE:${result.id}`);
        expect(journal.lines.create.map((line: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }) => [line.accountId, line.debit.toString(), line.credit.toString()])).toEqual([
            ['inventory-account', '80', '0'], ['cogs', '120', '0'], ['gr-clearing', '0', '200'],
        ]);
        expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ tx, action: 'POST_PURCHASE_PRICE_CORRECTION' }));
    });
    it('reverses debit/credit for a decrease', async () => {
        const { invoice } = fixture();
        vi.mocked(createDraftBillFromPo).mockImplementation(async () => { invoice.totalAmount = d(800); return invoice as never; });
        const value = await previewPurchasePriceCorrection({ invoiceId: 'bill', purchaseOrderItemId: 'item', newUnitPrice: '80' });
        await postPurchasePriceCorrection({ ...await input(), newUnitPrice: '80', sourceFingerprint: value.sourceFingerprint }, 'actor');
        const lines = tx.journalEntry.create.mock.calls[0][0].data.lines.create;
        expect(lines.map((line: { debit: Prisma.Decimal; credit: Prisma.Decimal }) => [line.debit.toString(), line.credit.toString()])).toEqual([['0', '80'], ['0', '120'], ['200', '0']]);
    });
    it('replays the identical key even after the bill/source changes', async () => {
        const data = await input();
        const result = await postPurchasePriceCorrection(data, 'actor');
        tx.purchasePriceCorrection.findUnique.mockResolvedValue(result);
        tx.purchaseOrder.findUnique.mockResolvedValue(null);
        expect(await postPurchasePriceCorrection(data, 'actor')).toBe(result);
        expect(tx.purchasePriceCorrection.create).toHaveBeenCalledTimes(1);
        await expect(postPurchasePriceCorrection({ ...data, reason: 'Instruksi berbeda' }, 'actor')).rejects.toMatchObject({ code: 'PURCHASE_PRICE_IDEMPOTENCY_CONFLICT' });
    });
    it.each(['PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED'])('rejects bill status %s', async status => {
        const { invoice } = fixture(); invoice.status = status;
        await expect(input()).rejects.toMatchObject({ code: 'PURCHASE_PRICE_BILL_PROTECTED' });
    });
    it.each(['DRAFT', 'UNPAID'])('rejects positive payment for %s', async status => {
        const { invoice } = fixture(); invoice.status = status; invoice.paidAmount = d(1);
        await expect(input()).rejects.toMatchObject({ code: 'PURCHASE_PRICE_BILL_PROTECTED' });
    });
    it.each(['none', 'multiple', 'supplementary'])('rejects ambiguous bills %s', async mode => {
        const { po, invoice } = fixture();
        if (mode === 'none') po.invoices = [];
        if (mode === 'multiple') po.invoices.push({ ...invoice, id: 'bill-2' });
        if (mode === 'supplementary') invoice.notes = 'Suplementer: sintetis';
        await expect(input()).rejects.toMatchObject({ code: 'PURCHASE_PRICE_BILL_AMBIGUOUS' });
    });
    it.each(['maklon', 'asset', 'asset-type', 'zero-cost', 'free', 'ambiguous-receipt'])('rejects %s source', async kind => {
        const { po, item, grItem } = fixture();
        const codes: Record<string, string> = { maklon: 'MAKLON', asset: 'FIXED_ASSET', 'asset-type': 'FIXED_ASSET', 'zero-cost': 'ZERO_COST', free: 'ZERO_COST', 'ambiguous-receipt': 'RECEIPT_AMBIGUOUS' };
        if (kind === 'maklon') po.goodsReceipts[0].isMaklon = true;
        if (kind === 'asset') tx.fixedAsset.count.mockResolvedValue(1);
        if (kind === 'asset-type') item.productVariant.product.productType = 'FIXED_ASSET';
        if (kind === 'zero-cost') item.unitPrice = d(0);
        if (kind === 'free') item.discountPercent = d(100);
        if (kind === 'ambiguous-receipt') { grItem.purchaseOrderItemId = null; po.items.push({ ...item, id: 'second-item' }); }
        await expect(input()).rejects.toMatchObject({ code: `PURCHASE_PRICE_${codes[kind]}` });
    });
    it('allows unambiguous legacy GR attribution', async () => {
        fixture().grItem.purchaseOrderItemId = null;
        await expect(input()).resolves.toHaveProperty('sourceFingerprint');
    });
    it('rejects unchanged price and a missing line', async () => {
        await expect(previewPurchasePriceCorrection({ invoiceId: 'bill', purchaseOrderItemId: 'item', newUnitPrice: '100' })).rejects.toMatchObject({ code: 'PURCHASE_PRICE_UNCHANGED' });
        await expect(previewPurchasePriceCorrection({ invoiceId: 'bill', purchaseOrderItemId: 'other', newUnitPrice: '120' })).rejects.toThrow(/tidak ditemukan/);
    });
    it.each(['stock', 'average', 'price', 'bill'])('rejects stale %s fingerprint before writes', async kind => {
        const { inventory, item, invoice } = fixture();
        const data = await input();
        if (kind === 'stock') inventory.quantity = d(3);
        if (kind === 'average') inventory.averageCost = d(101);
        if (kind === 'price') item.unitPrice = d(101);
        if (kind === 'bill') invoice.updatedAt = new Date();
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toMatchObject({ code: 'PURCHASE_PRICE_SOURCE_CHANGED' });
        expect(tx.purchaseOrderItem.update).not.toHaveBeenCalled();
    });
    it('rejects closed posting period before writes', async () => {
        const data = await input();
        vi.mocked(requireOpenJournalPeriod).mockRejectedValue(new Error('Periode tertutup'));
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toThrow(/tertutup/);
        expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
    });
    it('rejects inactive/conflicting accounts before writes', async () => {
        const data = await input(); tx.account.count.mockResolvedValue(2);
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toMatchObject({ code: 'PURCHASE_PRICE_ACCOUNT_INVALID' });
        expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
    });
    it('propagates failed sync before WAC/journal', async () => {
        const data = await input();
        vi.mocked(createDraftBillFromPo).mockRejectedValue(new Error('Sinkronisasi gagal'));
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toThrow(/Sinkronisasi gagal/);
        expect(tx.inventory.update).not.toHaveBeenCalled();
        expect(tx.journalEntry.create).not.toHaveBeenCalled();
    });
    it('rejects protected/noop sync result with wrong total', async () => {
        const { invoice } = fixture(); const data = await input();
        vi.mocked(createDraftBillFromPo).mockResolvedValue(invoice as never);
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toMatchObject({ code: 'PURCHASE_PRICE_SYNC_FAILED' });
        expect(tx.inventory.update).not.toHaveBeenCalled();
    });
    it('propagates an audit failure rather than reporting successful posting', async () => {
        const data = await input();
        vi.mocked(logActivity).mockRejectedValue(new Error('Audit gagal'));
        await expect(postPurchasePriceCorrection(data, 'actor')).rejects.toThrow(/Audit gagal/);
        expect(tx.purchasePriceCorrection.create).toHaveBeenCalledOnce();
    });
    it('rejects receipt with zero historical cost', async () => {
        fixture().grItem.unitCost = d(0);
        await expect(input()).rejects.toMatchObject({ code: 'PURCHASE_PRICE_ZERO_COST' });
    });
    it('rejects an unsynchronized bill', async () => {
        vi.mocked(calculatePoInvoiceTotalFromReceipts).mockResolvedValue(999);
        await expect(input()).rejects.toMatchObject({ code: 'PURCHASE_PRICE_BILL_MISMATCH' });
    });
    it('rejects zero rounded receipt delta', async () => {
        await expect(previewPurchasePriceCorrection({ invoiceId: 'bill', purchaseOrderItemId: 'item', newUnitPrice: '100.0001' })).rejects.toMatchObject({ code: 'PURCHASE_PRICE_ZERO_DELTA' });
    });
    it('posts missing/zero stock entirely to variance without Inventory writes', async () => {
        tx.inventory.findUnique.mockResolvedValue(null);
        const data = await input();
        const result = await postPurchasePriceCorrection(data, 'actor');
        expect(result).toMatchObject({ inventoryAmount: '0.00', varianceAmount: '200.00' });
        expect(tx.inventory.update).not.toHaveBeenCalled();
    });
    it.each(['0', '-1'])('returns a localized validation error for price %s', async newUnitPrice => {
        await expect(postPurchasePriceCorrection({ ...await input(), newUnitPrice }, 'actor')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
    });
    it('requires tenant context', async () => {
        tenant.available = false;
        await expect(getPurchasePriceCorrectionContext('bill')).rejects.toThrow(/tenant/);
    });
});
