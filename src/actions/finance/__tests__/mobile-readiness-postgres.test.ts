import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { returnTestClient, resetReturnFixture, actor, date as postingDate } from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { tenantContext } from '@/lib/core/prisma';
import { getFinanceMobileOverview } from '../mobile-dashboard';
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
vi.mock('@/lib/auth/purchasing-access', () => ({ requirePurchasingAccess: async () => ({ user: { role: 'PROCUREMENT' } }) }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireRole: async () => ({}), requireAuth: async () => ({ user: { role: 'PRODUCTION' } }) }));
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
        const result = await run(getFinanceMobileOverview);
        expect(result).toMatchObject({ success: true, data: { highlights: { overdueArCount: 13, overdueArAmount: 2087.8, overdueApCount: 2, overdueApAmount: 800 } } });
        if (!result.success) throw new Error(result.error);
        expect(result.data.recentInvoices.filter(i => i.type === 'AR')).toHaveLength(10);
        expect(result.data.recentInvoices.filter(i => i.type === 'AP')).toHaveLength(2);
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
        expect(overview).toMatchObject({ success: true, data: { highlights: { presentTodayCount: 1, pendingLeaveCount: 12 } } });
        if (!overview.success) throw new Error(overview.error);
        expect(overview.data.pendingLeaves).toHaveLength(10); expect(overview.data.pendingLeaves[0].leaveType).toBe('ANNUAL');
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
        expect(result.data.highlights.activeOrdersCount).toBe(15);
        expect(result.data.recentOrders).toHaveLength(10); expect(result.data.downtimeAlerts).toHaveLength(5);
        expect(result.data.highlights.downtimeMinutesToday).toBe(Math.round((now.getTime() - startOfDay.getTime()) / 60000) * 6);
    });
});
