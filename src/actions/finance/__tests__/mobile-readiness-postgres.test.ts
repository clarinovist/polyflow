import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { returnTestClient, resetReturnFixture, actor, date as postingDate } from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { tenantContext } from '@/lib/core/prisma';
import { getFinanceMobileInvoiceDetail, getFinanceMobileOverview } from '../mobile-dashboard';
import { getHrdMobileOverview, getHrdMobileTeamAttendance } from '@/actions/hrd/mobile-dashboard';
import { getProductionSupervisorOverview } from '@/actions/production/mobile-supervisor';
import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import { toBusinessDateString, getWibDayBounds } from '@/lib/utils/timezone';
import { getPriceAdjustmentSource } from '@/services/finance/invoice-price-source';
import { postInvoicePriceAdjustment } from '@/services/finance/invoice-price-adjustment-service';
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: async (role: string) => ({ id: role === 'accounts-receivable' ? 'ar' : role === 'vat-output' ? 'vat' : role === 'sales-revenue' ? 'revenue' : 'return' }) }));

// Auth is tested separately; these contracts use real Prisma/SQL in the existing disposable CI DB.
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: async () => ({ user: { role: 'FINANCE' } }) }));
vi.mock('@/lib/auth/purchasing-access', () => ({ requirePurchasingAccess: async () => ({ user: { id: 'procurement-test', role: 'PROCUREMENT' } }) }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({ requireMobilePortalAccess: async () => ({ portal: { id: 'purchasing' }, permissions: 'ALL' }) }));
vi.mock('@/actions/admin/permissions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/actions/admin/permissions')>()),
    getMyExplicitFeaturePermissions: async () => ({ success: true, data: ['feature:view-prices'] }),
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireRole: async (roles: string[]) => ({ user: { id: 'mobile-postgres-test', role: roles[0] } }), requireAuth: async () => ({ user: { id: 'mobile-postgres-test', role: 'PRODUCTION' } }) }));
const db = process.env.RETURN_CREDIT_TEST_DATABASE_URL ? returnTestClient(process.env.RETURN_CREDIT_TEST_DATABASE_URL) : null;
const run = <T>(fn: () => Promise<T>) => tenantContext.run(db!, fn);

describe.skipIf(!db)('mobile read contracts on isolated PostgreSQL', () => {
    beforeEach(async () => { await resetReturnFixture(db!, false); });
    afterAll(async () => { await db?.$disconnect(); });
    it('totals all net overdue invoices with generated AR balance and AP field comparison', async () => {
        const past = new Date('2026-01-01');
        await db!.invoice.update({ where: { id: 'invoice' }, data: { dueDate: past, paidAmount: 200, status: 'PARTIAL' } });
        // Populate the adjustment through the real ledger service, never edit protected caches.
        const source = await db!.$transaction(tx => getPriceAdjustmentSource(tx, 'invoice'));
        await run(() => postInvoicePriceAdjustment({ invoiceId: 'invoice', sourceItemId: 'source-item', quantity: '2', newNetUnitPrice: '90', sourceFingerprint: source.fingerprint, expectedRemaining: source.invoice.remainingAmount.toString(), postingDate, reason: 'Synthetic agreed price change', idempotencyKey: randomUUID(), confirmed: true }, actor));
        for (let i = 0; i < 12; i++) {
            const order = await db!.salesOrder.create({ data: { orderNumber: `MOBILE-SO-${i}`, customerId: 'customer' } });
            await db!.invoice.create({ data: { invoiceNumber: `MOBILE-AR-${i}`, salesOrderId: order.id, dueDate: past, totalAmount: 100, status: 'UNPAID' } });
        }
        await db!.supplier.create({ data: { id: 'mobile-supplier', name: 'Synthetic supplier' } });
        await db!.purchaseOrder.create({ data: { id: 'mobile-po', orderNumber: 'MOBILE-PO', supplierId: 'mobile-supplier' } });
        await db!.purchaseInvoice.createMany({ data: [
            { invoiceNumber: 'MOBILE-AP', purchaseOrderId: 'mobile-po', totalAmount: 1000, paidAmount: 400, status: 'PARTIAL', dueDate: past },
            { invoiceNumber: 'MOBILE-AP-OVERDUE', purchaseOrderId: 'mobile-po', totalAmount: 200, status: 'OVERDUE', dueDate: past },
            { invoiceNumber: 'MOBILE-AP-SETTLED', purchaseOrderId: 'mobile-po', totalAmount: 300, paidAmount: 300, status: 'PARTIAL', dueDate: past },
            { invoiceNumber: 'MOBILE-AP-CANCEL', purchaseOrderId: 'mobile-po', totalAmount: 900, status: 'CANCELLED', dueDate: past },
            { invoiceNumber: 'MOBILE-AP-FUTURE', purchaseOrderId: 'mobile-po', totalAmount: 500, status: 'UNPAID', dueDate: new Date('2099-01-01') },
        ] });
        const result = await run(() => getFinanceMobileOverview({ due: 'OVERDUE' }));
        expect(result).toMatchObject({ success: true, data: { counts: { ar: 13, ap: 2 }, highlights: { arAmount: 2087.8, apAmount: 800 } } });
        if (!result.success) throw new Error(result.error);
        expect(result.data.invoices.filter(i => i.type === 'AR')).toHaveLength(10);
        expect(result.data.invoices.filter(i => i.type === 'AP')).toHaveLength(2);
        expect(await run(getPurchasingMobileOverview)).toMatchObject({ success: true, data: { highlights: { overdueApCount: 2, overdueApAmount: 800 } } });
    });
    it('counts PRESENT people once, ignores future/absent records and derives NO_RECORD', async () => {
        // Reset only fixture-owned HR records, which are not in the finance reset helper.
        await db!.$executeRaw`TRUNCATE "Employee", "WorkShift" CASCADE`;
        await db!.employee.createMany({ data: [
            { id: 'mobile-e1', name: 'Synthetic One', code: 'M-E1', role: 'OPERATOR' },
            { id: 'mobile-e2', name: 'Synthetic Two', code: 'M-E2', role: 'OPERATOR' },
            { id: 'mobile-e3', name: 'Synthetic Three', code: 'M-E3', role: 'OPERATOR' },
        ] });
        await db!.workShift.createMany({ data: [{ id: 'mobile-s1', name: 'Morning', startTime: '07:00', endTime: '15:00' }, { id: 'mobile-s2', name: 'Evening', startTime: '15:00', endTime: '23:00' }] });
        const date = toBusinessDateString(new Date()); const workDate = new Date(`${date}T00:00:00Z`);
        await db!.attendanceRecord.createMany({ data: [
            { employeeId: 'mobile-e1', workShiftId: 'mobile-s1', workDate, status: 'PRESENT' },
            { employeeId: 'mobile-e1', workShiftId: 'mobile-s2', workDate, status: 'PRESENT' },
            { employeeId: 'mobile-e2', workShiftId: 'mobile-s1', workDate, status: 'ABSENT' },
            { employeeId: 'mobile-e3', workShiftId: 'mobile-s1', workDate: new Date('2099-01-01'), status: 'PRESENT' },
        ] });
        await db!.leaveRequest.createMany({ data: Array.from({ length: 12 }, () => ({ employeeId: 'mobile-e1', type: 'ANNUAL' as const, startDate: workDate, endDate: workDate, status: 'PENDING' as const })) });
        const overview = await run(getHrdMobileOverview);
        expect(overview).toMatchObject({
            success: true,
            data: {
                health: {
                    attendanceToday: {
                        status: 'AVAILABLE',
                        data: { present: 1, absent: 1 },
                    },
                },
                attention: {
                    pendingLeave: {
                        status: 'AVAILABLE',
                        data: { count: 12 },
                    },
                },
            },
        });
        if (!overview.success) throw new Error(overview.error);
        expect(overview.data).not.toHaveProperty('pendingLeaves');
        expect(overview.data).not.toHaveProperty('alerts');
        const attendance = await run(() => getHrdMobileTeamAttendance({ date, status: 'NO_RECORD' }));
        expect(attendance).toMatchObject({ success: true, data: { noRecordCount: 1, absentCount: 0, records: [{ employeeId: 'mobile-e3' }] } });
        expect(await run(() => getHrdMobileTeamAttendance({ date, status: 'PRESENT' }))).toMatchObject({ success: true, data: { presentCount: 1, totalEmployees: 1 } });
    });
    it('counts all active SPKs and every overlapping downtime independently of feeds', async () => {
        await db!.bom.create({ data: { id: 'mobile-bom', name: 'Synthetic BOM', productVariantId: 'variant' } });
        const now = new Date(); const { startOfDay } = getWibDayBounds(toBusinessDateString(now));
        await db!.productionOrder.createMany({ data: Array.from({ length: 15 }, (_, i) => ({ orderNumber: `MOBILE-SPK-${i}`, bomId: 'mobile-bom', locationId: 'location', plannedQuantity: 10, plannedStartDate: now, status: 'IN_PROGRESS' as const })) });
        await db!.machine.create({ data: { id: 'mobile-machine', name: 'Synthetic Machine', code: 'M-M', type: 'EXTRUDER', locationId: 'location' } });
        const yesterday = new Date(startOfDay.getTime() - 3600000);
        await db!.machineDowntime.createMany({ data: Array.from({ length: 6 }, () => ({ machineId: 'mobile-machine', reason: 'Synthetic interval', startTime: yesterday, endTime: now })) });
        const result = await run(getProductionSupervisorOverview);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.error);
        expect(result.data.health.activeSpk).toEqual({
            status: 'AVAILABLE',
            data: { count: 15 },
        });
        expect(result.data.health.downtime).toMatchObject({
            status: 'AVAILABLE',
            data: {
                openCount: 0,
                totalMinutesToday:
                    Math.round(
                        (now.getTime() - startOfDay.getTime()) / 60000,
                    ) * 6,
            },
        });
    });
    it('excludes historical AR markers in every mode and applies the AP net field comparison in SQL', async () => {
        const past = new Date('2026-01-01');
        const modes = ['ALL', 'OVERDUE', 'DUE_SOON'] as const;
        const arBaseline: Record<string, number> = {};
        const apBaseline: Record<string, number> = {};
        for (const due of modes) {
            const ar = await run(() => getFinanceMobileOverview({ type: 'AR', due }));
            const ap = await run(() => getFinanceMobileOverview({ type: 'AP', due }));
            expect(ar.success && ap.success).toBe(true);
            if (!ar.success || !ap.success) throw new Error('baseline read failed');
            arBaseline[due] = ar.data.counts.ar ?? 0;
            apBaseline[due] = ap.data.counts.ap ?? 0;
        }

        // Canonical operational AR exclusion must hold on real SQL: every
        // historical marker plus a null-customer order stays out of the queue.
        const historical = [
            { orderNumber: 'SO-OPEN-HIST', notes: null },
            { orderNumber: 'OB-AR-HIST', notes: null },
            { orderNumber: 'MOBILE-HIST-NOTE-A', notes: 'Opening Balance Entry' },
            { orderNumber: 'MOBILE-HIST-NOTE-B', notes: 'Sheet Penjualan Jun:' },
        ];
        const historicalInvoiceIds: string[] = [];
        for (const [index, marker] of historical.entries()) {
            const order = await db!.salesOrder.create({
                data: {
                    orderNumber: marker.orderNumber,
                    notes: marker.notes,
                    customerId: 'customer',
                },
            });
            const invoice = await db!.invoice.create({
                data: {
                    invoiceNumber: `MOBILE-HIST-${index}`,
                    salesOrderId: order.id,
                    totalAmount: 500,
                    status: 'UNPAID',
                    dueDate: past,
                },
            });
            historicalInvoiceIds.push(invoice.id);
        }
        const orphan = await db!.salesOrder.create({
            data: { orderNumber: 'MOBILE-HIST-ORPHAN', notes: null },
        });
        await db!.invoice.create({
            data: {
                invoiceNumber: 'MOBILE-HIST-ORPHAN',
                salesOrderId: orphan.id,
                totalAmount: 500,
                status: 'UNPAID',
                dueDate: past,
            },
        });

        // AP net comparison runs in SQL: only totalAmount > paidAmount rows are
        // outstanding, and the status allowlist still applies.
        await db!.supplier.create({
            data: { id: 'mobile-hist-supplier', name: 'Synthetic history supplier' },
        });
        await db!.purchaseOrder.create({
            data: {
                id: 'mobile-hist-po',
                orderNumber: 'MOBILE-HIST-PO',
                supplierId: 'mobile-hist-supplier',
            },
        });
        await db!.purchaseInvoice.createMany({
            data: [
                { invoiceNumber: 'MOBILE-HIST-AP-NET', purchaseOrderId: 'mobile-hist-po', totalAmount: 1000, paidAmount: 400, status: 'PARTIAL', dueDate: past },
                { invoiceNumber: 'MOBILE-HIST-AP-SETTLED', purchaseOrderId: 'mobile-hist-po', totalAmount: 500, paidAmount: 500, status: 'PARTIAL', dueDate: past },
                { invoiceNumber: 'MOBILE-HIST-AP-OVERPAID', purchaseOrderId: 'mobile-hist-po', totalAmount: 300, paidAmount: 400, status: 'PARTIAL', dueDate: past },
                { invoiceNumber: 'MOBILE-HIST-AP-CANCELLED', purchaseOrderId: 'mobile-hist-po', totalAmount: 900, paidAmount: 0, status: 'CANCELLED', dueDate: past },
            ],
        });

        for (const due of modes) {
            const ar = await run(() => getFinanceMobileOverview({ type: 'AR', due }));
            expect(ar.success).toBe(true);
            if (!ar.success) throw new Error(ar.error);
            expect(ar.data.counts.ar).toBe(arBaseline[due]);
            expect(ar.data.sections.arNominal).toBe('AVAILABLE');

            const ap = await run(() => getFinanceMobileOverview({ type: 'AP', due }));
            expect(ap.success).toBe(true);
            if (!ap.success) throw new Error(ap.error);
            // DUE_SOON restricts to the next seven days, so the past-dated
            // synthetic AP rows stay out; ALL and OVERDUE must include the
            // single net-outstanding row.
            expect(ap.data.counts.ap).toBe(
                apBaseline[due] + (due === 'DUE_SOON' ? 0 : 1),
            );
        }

        for (const invoiceId of historicalInvoiceIds) {
            await expect(
                run(() => getFinanceMobileInvoiceDetail('AR', invoiceId)),
            ).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' });
        }
    });
});
