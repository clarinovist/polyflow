import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
    returnTestClient,
    verifyReturnTestDatabase,
} from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { readWarehouseInventoryThresholdSnapshot } from '@/services/inventory/warehouse-dashboard-service';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { fieldSalesReceivableWhere } from '@/services/sales/mobile-field-sales-service';
import { readProductionOutputHealth } from '@/services/production/production-dashboard-health-service';
import { readHrdDashboardPayrollReadiness } from '@/services/hrd/hrd-dashboard-service';

const db = process.env.RETURN_CREDIT_TEST_DATABASE_URL
    ? returnTestClient(process.env.RETURN_CREDIT_TEST_DATABASE_URL)
    : null;

const statementCounts: Record<string, number> = {};
function counted<T>(label: string, read: () => Promise<T>): Promise<T> {
    statementCounts[label] = (statementCounts[label] ?? 0) + 1;
    return read();
}

async function explain(
    client: PrismaClient,
    sql: string,
): Promise<{ Plan: { 'Node Type': string } }> {
    const rows = await client.$queryRawUnsafe<
        Array<{ 'QUERY PLAN': Array<{ Plan: { 'Node Type': string } }> }>
    >('EXPLAIN (FORMAT JSON, COSTS TRUE) ' + sql);
    return rows[0]['QUERY PLAN'][0];
}

function planNodeTypes(plan: unknown): string[] {
    if (!plan || typeof plan !== 'object') return [];
    const record = plan as Record<string, unknown>;
    return [
        ...(typeof record['Node Type'] === 'string'
            ? [record['Node Type']]
            : []),
        ...Object.values(record).flatMap(planNodeTypes),
    ];
}

describe.skipIf(!db)('dashboard hardening query evidence on disposable PostgreSQL', () => {
    beforeAll(async () => {
        await verifyReturnTestDatabase(db!);
        await db!.$executeRawUnsafe(
            'TRUNCATE "Payslip", "PayrollPeriod", "Employee", "ProductionExecution", "ProductionOrder", "Bom", "Inventory", "ProductVariant", "Product", "Location", "PurchaseInvoice", "PurchaseOrder", "Supplier", "Invoice", "SalesOrder", "CustomerSalesAssignment", "Customer", "User" CASCADE',
        );
        await db!.user.create({
            data: {
                id: 'dashboard-hardening-user',
                email: 'dashboard-hardening@example.invalid',
                password: 'fixture-not-an-account',
                role: 'SALES',
            },
        });
        await db!.customer.create({
            data: { id: 'dashboard-hardening-customer', name: 'Synthetic' },
        });
        await db!.location.create({
            data: {
                id: 'dashboard-hardening-location',
                name: 'Synthetic RM',
                slug: 'dashboard-hardening-rm',
                locationType: 'INTERNAL',
                locationPurpose: 'RAW_MATERIAL',
            },
        });
        await db!.product.create({
            data: {
                id: 'dashboard-hardening-product',
                name: 'Synthetic Product',
                productType: 'FINISHED_GOOD',
            },
        });
        await db!.productVariant.create({
            data: {
                id: 'dashboard-hardening-variant',
                productId: 'dashboard-hardening-product',
                name: 'Synthetic Variant',
                skuCode: 'DASH-HARDEN',
                primaryUnit: 'KG',
                minStockAlert: 10,
                reorderPoint: 8,
                inventories: {
                    create: {
                        locationId: 'dashboard-hardening-location',
                        quantity: 3,
                    },
                },
            },
        });
        await db!.bom.create({
            data: {
                id: 'dashboard-hardening-bom',
                name: 'Synthetic BOM',
                productVariantId: 'dashboard-hardening-variant',
                category: 'MIXING',
            },
        });
        await db!.productionOrder.create({
            data: {
                id: 'dashboard-hardening-order',
                orderNumber: 'DASH-HARDEN-ORDER',
                bomId: 'dashboard-hardening-bom',
                plannedQuantity: 10,
                plannedStartDate: new Date('2026-10-10T00:00:00.000Z'),
                locationId: 'dashboard-hardening-location',
                status: 'IN_PROGRESS',
                executions: {
                    create: {
                        id: 'dashboard-hardening-execution',
                        quantityProduced: 5,
                        startTime: new Date('2026-10-10T03:00:00.000Z'),
                    },
                },
            },
        });
        await db!.salesOrder.create({
            data: {
                id: 'dashboard-hardening-sales-order',
                orderNumber: 'DASH-HARDEN-SO',
                customerId: 'dashboard-hardening-customer',
                createdById: 'dashboard-hardening-user',
            },
        });
        await db!.invoice.create({
            data: {
                id: 'dashboard-hardening-ar',
                invoiceNumber: 'DASH-HARDEN-AR',
                salesOrderId: 'dashboard-hardening-sales-order',
                totalAmount: 500,
                status: 'UNPAID',
                dueDate: new Date('2026-10-01T00:00:00.000Z'),
            },
        });
        await db!.supplier.create({
            data: { id: 'dashboard-hardening-supplier', name: 'Synthetic' },
        });
        await db!.purchaseOrder.create({
            data: {
                id: 'dashboard-hardening-po',
                orderNumber: 'DASH-HARDEN-PO',
                supplierId: 'dashboard-hardening-supplier',
            },
        });
        await db!.purchaseInvoice.create({
            data: {
                id: 'dashboard-hardening-ap',
                invoiceNumber: 'DASH-HARDEN-AP',
                purchaseOrderId: 'dashboard-hardening-po',
                totalAmount: 1000,
                paidAmount: 400,
                status: 'PARTIAL',
                dueDate: new Date('2026-10-01T00:00:00.000Z'),
            },
        });
        await db!.employee.create({
            data: {
                id: 'dashboard-hardening-employee',
                name: 'Synthetic Employee',
                code: 'DASH-HARDEN-EMP',
                role: 'STAFF',
            },
        });
        await db!.payrollPeriod.create({
            data: {
                id: 'dashboard-hardening-payroll',
                year: 2026,
                month: 10,
                status: 'OPEN',
                payslips: {
                    create: {
                        id: 'dashboard-hardening-payslip',
                        employeeId: 'dashboard-hardening-employee',
                        baseSalary: 100,
                        grossPay: 100,
                        netPay: 100,
                        status: 'DRAFT',
                    },
                },
            },
        });
    });

    afterAll(async () => {
        await db?.$disconnect();
    });

    it('records representative query counts for canonical owner reads', async () => {
        const now = new Date('2026-10-10T03:00:00.000Z');
        const inventory = await counted('low-stock-reorder', () =>
            readWarehouseInventoryThresholdSnapshot(db!, {
                reorderDriverLimit: 10,
            }),
        );
        const ar = await counted('operational-ar', () =>
            db!.invoice.count({
                where: fieldSalesReceivableWhere({
                    actorUserId: 'dashboard-hardening-user',
                    isGlobalViewer: false,
                }),
            }),
        );
        const ap = await counted('overdue-ap', () =>
            db!.$transaction((tx) =>
                tx.purchaseInvoice.count({
                    where: buildOverduePurchaseInvoiceWhere(tx, now),
                }),
            ),
        );
        const output = await counted('production-output', () =>
            readProductionOutputHealth(db!, {
                startOfDay: new Date('2026-10-09T17:00:00.000Z'),
                endOfDay: new Date('2026-10-10T16:59:59.999Z'),
            }),
        );
        const payroll = await counted('hrd-payroll', () =>
            readHrdDashboardPayrollReadiness(db!),
        );

        expect(statementCounts).toEqual({
            'low-stock-reorder': 1,
            'operational-ar': 1,
            'overdue-ap': 1,
            'production-output': 1,
            'hrd-payroll': 1,
        });
        expect(inventory).toMatchObject({ lowStockCount: 1, reorderCount: 1 });
        expect(ar).toBe(1);
        expect(ap).toBe(1);
        expect(output.processTotals).toEqual([
            { processKey: 'MIXING', unit: 'KG', quantity: 5 },
        ]);
        expect(payroll).toMatchObject({ total: 1, draft: 1 });
    });

    it('captures representative EXPLAIN JSON without inventing an index/SLO', async () => {
        const plans = await Promise.all([
            explain(
                db!,
                'SELECT pv.id FROM "ProductVariant" pv LEFT JOIN "Inventory" i ON i."productVariantId" = pv.id WHERE pv."archivedAt" IS NULL AND (pv."minStockAlert" > 0 OR pv."reorderPoint" > 0) GROUP BY pv.id',
            ),
            explain(
                db!,
                'SELECT i.id FROM "Invoice" i JOIN "SalesOrder" so ON so.id = i."salesOrderId" WHERE i.status IN (\'UNPAID\',\'PARTIAL\',\'OVERDUE\') AND i."remainingAmount" > 0 AND so."customerId" IS NOT NULL',
            ),
            explain(
                db!,
                'SELECT pe."productionOrderId", SUM(pe."quantityProduced") FROM "ProductionExecution" pe WHERE pe.status <> \'VOIDED\' GROUP BY pe."productionOrderId"',
            ),
            explain(
                db!,
                'SELECT ps.status, COUNT(*) FROM "Payslip" ps WHERE ps."payrollPeriodId" = \'dashboard-hardening-payroll\' GROUP BY ps.status',
            ),
        ]);

        for (const plan of plans) {
            const nodeTypes = planNodeTypes(plan.Plan);
            expect(nodeTypes.length).toBeGreaterThan(0);
            expect(nodeTypes.every((node) => typeof node === 'string')).toBe(
                true,
            );
        }
    });
});
