import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  returnTestClient,
  verifyReturnTestDatabase,
} from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { detectCriticalStock, detectOverdueAp, detectOverdueAr } from '../detectors';
import { syncFindings } from '@/lib/findings/finding-sync';

// Real-PostgreSQL contract for the detector SQL changed in
// docs/plan/2026-10-31-finding-digest.md Fase 0: customer/supplier joins,
// the WIB business-day AP boundary, the legacy low-stock definition, and the
// Finding writes (baseline + severity events) the observe mode performs.
const url = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db: PrismaClient | null = url ? returnTestClient(url) : null;

const NOW = new Date('2026-10-31T03:00:00Z'); // 10:00 WIB
const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY);

async function seed(client: PrismaClient) {
  await verifyReturnTestDatabase(client);
  await client.$executeRaw`TRUNCATE "FindingEvent", "Finding", "Invoice", "SalesOrder", "Customer", "PurchaseInvoice", "PurchaseOrder", "Supplier", "Inventory", "ProductVariant", "Product", "Location" CASCADE`;

  await client.customer.create({ data: { id: 'det-customer', name: 'Synthetic Customer' } });
  await client.salesOrder.create({
    data: { id: 'det-so', orderNumber: 'SO-DET-1', customerId: 'det-customer', status: 'DELIVERED', totalAmount: 1000 },
  });
  await client.invoice.createMany({
    data: [
      { id: 'ar-young', invoiceNumber: 'INV-DET-YOUNG', salesOrderId: 'det-so', totalAmount: 1000, paidAmount: 400, status: 'PARTIAL', invoiceDate: daysBefore(40), dueDate: daysBefore(10) },
      { id: 'ar-old', invoiceNumber: 'INV-DET-OLD', salesOrderId: 'det-so', totalAmount: 500, status: 'OVERDUE', invoiceDate: daysBefore(70), dueDate: daysBefore(40) },
      { id: 'ar-paid', invoiceNumber: 'INV-DET-PAID', salesOrderId: 'det-so', totalAmount: 300, paidAmount: 300, status: 'PAID', invoiceDate: daysBefore(70), dueDate: daysBefore(40) },
      // Due after every timestamp this file evaluates (incl. NOW + 25 days).
      { id: 'ar-future', invoiceNumber: 'INV-DET-FUTURE', salesOrderId: 'det-so', totalAmount: 300, status: 'UNPAID', invoiceDate: daysBefore(5), dueDate: new Date(NOW.getTime() + 60 * DAY) },
    ],
  });

  await client.supplier.create({ data: { id: 'det-supplier', name: 'Synthetic Supplier' } });
  await client.purchaseOrder.create({ data: { id: 'det-po', orderNumber: 'PO-DET-1', supplierId: 'det-supplier' } });
  await client.purchaseInvoice.createMany({
    data: [
      // 23:59 WIB yesterday → before today's business-day start → overdue.
      { id: 'ap-yesterday', invoiceNumber: 'PI-DET-YESTERDAY', purchaseOrderId: 'det-po', totalAmount: 2000, status: 'UNPAID', dueDate: new Date('2026-10-30T16:59:00Z') },
      // 00:00 WIB today → not overdue yet even though it is before NOW.
      { id: 'ap-today', invoiceNumber: 'PI-DET-TODAY', purchaseOrderId: 'det-po', totalAmount: 2000, status: 'UNPAID', dueDate: new Date('2026-10-30T17:00:00Z') },
    ],
  });

  await client.location.createMany({
    data: [
      { id: 'det-rm', name: 'Synthetic RM', slug: 'det-rm', locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' },
      { id: 'det-wip', name: 'Synthetic WIP', slug: 'det-wip', locationType: 'INTERNAL', locationPurpose: 'WIP' },
    ],
  });
  await client.product.create({ data: { id: 'det-product', name: 'Synthetic Bag', productType: 'RAW_MATERIAL' } });
  await client.productVariant.createMany({
    data: [
      { id: 'det-low', productId: 'det-product', name: 'Low Variant', skuCode: 'DET-LOW', primaryUnit: 'KG', minStockAlert: 20 },
      { id: 'det-wip-only', productId: 'det-product', name: 'WIP Only Variant', skuCode: 'DET-WIP', primaryUnit: 'KG', minStockAlert: 20 },
      { id: 'det-ok', productId: 'det-product', name: 'Healthy Variant', skuCode: 'DET-OK', primaryUnit: 'KG', minStockAlert: 20 },
    ],
  });
  await client.inventory.createMany({
    data: [
      { locationId: 'det-rm', productVariantId: 'det-low', quantity: 8 },
      { locationId: 'det-wip', productVariantId: 'det-low', quantity: 500 },
      { locationId: 'det-wip', productVariantId: 'det-wip-only', quantity: 3 },
      { locationId: 'det-rm', productVariantId: 'det-ok', quantity: 25 },
    ],
  });
}

describe.skipIf(!db)('detectors on disposable PostgreSQL', () => {
  beforeEach(async () => seed(db!));
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('finds overdue AR with customer name and aging severity; skips paid and not-yet-due', async () => {
    const result = await detectOverdueAr(db!, NOW);

    expect(result.status).toBe('ok');
    const byId = Object.fromEntries(result.items.map((i) => [i.entityId, i]));
    expect(Object.keys(byId).sort()).toEqual(['ar-old', 'ar-young']);
    expect(byId['ar-young'].severity).toBe('warning');
    expect(byId['ar-young'].headline).toContain('Synthetic Customer');
    expect(byId['ar-young'].detail).toContain('Rp 600');
    expect(byId['ar-old'].severity).toBe('critical');
  });

  it('applies the WIB business-day boundary to overdue AP and joins the supplier', async () => {
    const result = await detectOverdueAp(db!, NOW);

    expect(result.status).toBe('ok');
    expect(result.items.map((i) => i.entityId)).toEqual(['ap-yesterday']);
    expect(result.items[0].headline).toContain('Synthetic Supplier');
    expect(result.items[0].severity).toBe('warning');
  });

  it('counts only alert locations for low stock, per variant', async () => {
    const result = await detectCriticalStock(db!);

    expect(result.status).toBe('ok');
    expect(result.items).toEqual([
      expect.objectContaining({
        entityKey: 'critical_stock:det-low',
        entityType: 'ProductVariant',
        severity: 'critical',
        headline: 'Low Variant: 8 < 20',
      }),
    ]);
  });

  it('writes baseline findings without SLA, then records a severity raise on refresh', async () => {
    const first = await detectOverdueAr(db!, NOW);
    await syncFindings(db!, [first], { baseline: true });

    const baseline = await db!.finding.findUniqueOrThrow({
      where: { fingerprint: 'overdue_ar:ar-young' },
      include: { events: true },
    });
    expect(baseline.slaDueAt).toBeNull();
    expect(baseline.severity).toBe('WARNING');
    expect(baseline.requiredResources).toEqual(['/sales/invoices', '/finance/invoices']);
    expect(baseline.events.map((e) => e.action)).toEqual(['DETECTED_BASELINE']);

    // 25 days later the same invoice is 35 days overdue → CRITICAL.
    const later = await detectOverdueAr(db!, new Date(NOW.getTime() + 25 * DAY));
    const outcome = await syncFindings(db!, [later], { baseline: true });

    const raised = await db!.finding.findUniqueOrThrow({
      where: { fingerprint: 'overdue_ar:ar-young' },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    expect(outcome.severityRaised).toContain(raised.id);
    expect(raised.severity).toBe('CRITICAL');
    expect(raised.slaDueAt).toBeNull();
    expect(raised.events.map((e) => e.action)).toEqual(['DETECTED_BASELINE', 'SEVERITY_RAISED']);
    const fingerprints = (await db!.finding.findMany({ select: { fingerprint: true } }))
      .map((f) => f.fingerprint)
      .sort();
    expect(fingerprints).toEqual(['overdue_ar:ar-old', 'overdue_ar:ar-young']);
  });
});
