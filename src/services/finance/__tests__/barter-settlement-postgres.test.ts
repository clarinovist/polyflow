import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, type PrismaClient } from '@prisma/client';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { actor, date, barterTestClient, verifyDisposable, resetFixture } from './barter-postgres-fixture';

const clients = vi.hoisted(() => ({ current: undefined as unknown as PrismaClient, context: undefined as unknown as AsyncLocalStorage<PrismaClient> }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: new Proxy({}, { get: (_target, property) => {
        const db = clients.context?.getStore() ?? clients.current;
        const value = db?.[property as keyof PrismaClient];
        return typeof value === 'function' ? value.bind(db) : value;
    } }),
    getTenantDbFromContext: () => clients.context?.getStore() ?? clients.current,
}));
// Only fixture account mapping/settings are substituted. Financial writes, sequences,
// locks, journal posting, period checks and critical audit use real production code + PG.
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: async (role: string) => ({ id: role === 'accounts-receivable' ? 'ar' : role === 'accounts-payable' ? 'ap' : 'cash', code: role, name: role }) }));
vi.mock('@/services/settings/app-settings-service', () => ({ getPaymentBanksSetting: async () => [] }));
import { BarterSettlementService as service } from '../barter-settlement-service';
import { BarterPartnerService } from '../barter-partner-service';
import { recordCustomerPaymentInTransaction } from '../customer-payment-service';
import { collectBarterHealth } from '../barter-health-service';
import { recordPayment as supplierPayment } from '@/services/purchasing/invoices-service';

const input = (amount = 600, cash = 0, key = randomUUID()) => ({ invoiceId: 'ar-invoice', purchaseInvoiceId: 'ap-invoice', barterAmount: String(amount), barterDate: date,
    includeCashPayment: cash > 0, cashAmount: String(cash), cashMethod: 'Cash', cashPaymentDate: date, notes: 'Fixture agreement', idempotencyKey: key });
const enabled = Boolean(process.env.BARTER_TEST_DATABASE_URL);

describe.skipIf(!enabled)('barter real PostgreSQL disposable integration', () => {
    let db: PrismaClient;
    let other: PrismaClient;
    beforeAll(async () => {
        db = barterTestClient(process.env.BARTER_TEST_DATABASE_URL, 'polyflow_barter_test');
        other = barterTestClient(process.env.BARTER_TEST_DATABASE_URL_2, 'polyflow_barter_test_2');
        clients.current = db; clients.context = new AsyncLocalStorage<PrismaClient>();
        await verifyDisposable(db, 'polyflow_barter_test'); await verifyDisposable(other, 'polyflow_barter_test_2');
    });
    beforeEach(async () => { await resetFixture(db, 'polyflow_barter_test'); });
    afterAll(async () => { await db?.$disconnect(); await other?.$disconnect(); });
    async function balances(ar: number, ap: number) {
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: 'ar-invoice' } })).paidAmount)).toBe(ar);
        expect(Number((await db.purchaseInvoice.findUniqueOrThrow({ where: { id: 'ap-invoice' } })).paidAmount)).toBe(ap);
    }
    const ordinary = (amount: number) => db.$transaction(tx => recordCustomerPaymentInTransaction(tx, { invoiceId: 'ar-invoice', amount, paymentDate: date, method: 'Cash' }, `ORD-${randomUUID()}`, actor), { timeout: 15000 });
    // Deterministic overlap: hold a row, start production service, observe an actual
    // blocked PG backend before releasing. A sleep alone is not concurrency evidence.
    async function blockedBy(table: 'Invoice' | 'PurchaseInvoice' | 'BarterPartner', id: string, run: () => Promise<unknown>, beforeRelease?: (tx: Prisma.TransactionClient) => Promise<unknown>) {
        let started!: () => void; let release!: () => void;
        const ready = new Promise<void>(r => { started = r; });
        const gate = new Promise<void>(r => { release = r; });
        let pid = 0;
        const holder = db.$transaction(async tx => {
            const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`;
            pid = rows[0].pid;
            await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE`);
            started(); await gate; await beforeRelease?.(tx);
        }, { timeout: 15000 });
        await ready;
        const pending = run();
        const settled = Promise.allSettled([pending]); // attach rejection immediately
        try {
            let blocked = false;
            for (let i = 0; i < 150; i++) {
                const rows = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))) blocked`;
                if (rows[0].blocked) { blocked = true; break; }
                await new Promise(r => setTimeout(r, 20));
            }
            expect(blocked).toBe(true);
        } finally { release(); await holder; }
        const [outcome] = await settled;
        if (outcome.status === 'rejected') throw outcome.reason;
        return outcome.value;
    }
    it.each([[600, 400], [600, 0], [600, 200], [300, 200]])('posts B=%i C=%i and preserves balanced noncash/cash journals', async (b, c) => {
        const s = await service.create(input(b, c), actor);
        await balances(b, b + c);
        expect(s.payments).toHaveLength(c ? 3 : 2);
        expect((await collectBarterHealth(db)).issues).toEqual([]);
        const cash = await db.journalLine.aggregate({ where: { accountId: 'cash', journalEntry: { status: 'POSTED' } }, _sum: { debit: true, credit: true } });
        expect(Number(cash._sum.credit) - Number(cash._sum.debit)).toBe(c);
        expect(await db.auditLog.count({ where: { action: 'CREATE_BARTER_SETTLEMENT' } })).toBe(1);
    });
    it('rolls back create and void on a late real audit trigger failure', async () => {
        await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION barter_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('CREATE_BARTER_SETTLEMENT','VOID_BARTER_SETTLEMENT') THEN RAISE EXCEPTION 'barter audit injected failure'; END IF; RETURN NEW; END $$`);
        const install = () => db.$executeRawUnsafe(`CREATE TRIGGER barter_test_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION barter_test_fail_audit()`);
        const drop = () => db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS barter_test_fail_audit ON "AuditLog"`);
        try {
            await install(); await expect(service.create(input(600, 400), actor)).rejects.toThrow();
            await balances(0, 0); expect(await db.payment.count()).toBe(0); expect(await db.barterSettlement.count()).toBe(0);
            expect(await db.journalEntry.count()).toBe(2); expect(await db.auditLog.count()).toBe(0);
            expect((await db.journalEntry.findUniqueOrThrow({ where: { id: 'ar-journal' } })).status).toBe('DRAFT');
            await drop(); const s = await service.create(input(300, 200), actor);
            await install(); await expect(service.void({ settlementId: s.id, reason: 'Fixture rollback' }, actor)).rejects.toThrow();
            await balances(300, 500); expect(await db.payment.count()).toBe(3);
            expect(await db.journalEntry.count({ where: { status: 'VOIDED' } })).toBe(0);
            expect((await db.barterSettlement.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('POSTED');
        } finally { await drop(); }
    });
    it.each(['Invoice', 'PurchaseInvoice'] as const)('actually waits on %s row locks', async table => {
        await blockedBy(table, table === 'Invoice' ? 'ar-invoice' : 'ap-invoice', () => service.create(input(), actor));
        await balances(600, 600);
    });
    it('same idempotency key races return one committed package; changed payload conflicts and VOIDED replay stays voided', async () => {
        const data = input(300, 200);
        const results = await Promise.all([service.create(data, actor), service.create(data, actor), service.create(data, actor)]);
        expect(new Set(results.map(s => s.id)).size).toBe(1); expect(await db.payment.count()).toBe(3);
        await expect(service.create({ ...data, notes: 'Changed agreement' }, actor)).rejects.toMatchObject({ code: 'BARTER_IDEMPOTENCY_CONFLICT' });
        await service.void({ settlementId: results[0].id, reason: 'Fixture void' }, actor);
        expect((await service.create(data, actor)).status).toBe('VOIDED'); await balances(0, 0);
    });
    it('different keys cannot concurrently overpay; DB rejects duplicate legs and orphan removal', async () => {
        const outcomes = await Promise.allSettled([service.create(input(500), actor), service.create(input(500), actor)]);
        expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1); await balances(500, 500);
        const p = await db.payment.findFirstOrThrow({ where: { barterLeg: 'AR_OFFSET' } });
        await expect(db.payment.create({ data: { ...p, id: randomUUID(), paymentNumber: 'DUPLICATE-LEG' } })).rejects.toMatchObject({ code: 'P2002' });
        await expect(db.payment.delete({ where: { id: p.id } })).rejects.toThrow();
        expect(await db.payment.count()).toBe(2);
    });
    it('race with ordinary customer payment never overpays or leaves half a bundle', async () => {
        const results = await Promise.allSettled([service.create(input(500, 200), actor), ordinary(500)]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const barterCount = await db.barterSettlement.count(); await balances(500, barterCount ? 700 : 0);
        expect(await db.payment.count()).toBe(barterCount ? 3 : 1);
    });
    it('race with ordinary supplier payment cannot overpay AP or partially settle AR', async () => {
        const results = await Promise.allSettled([service.create(input(500, 400), actor), supplierPayment('ap-invoice', 800, actor, { method: 'Cash', paymentDate: date })]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const hasBarter = await db.barterSettlement.count();
        await balances(hasBarter ? 500 : 0, hasBarter ? 900 : 800);
        expect(await db.payment.count()).toBe(hasBarter ? 3 : 1);
    });
    it('create racing void preserves the sum of only committed active legs', async () => {
        const first = await service.create(input(300), actor);
        await Promise.all([service.void({ settlementId: first.id, reason: 'Fixture correction' }, actor), service.create(input(200), actor)]);
        await balances(200, 200);
        expect(await db.barterSettlement.count({ where: { status: 'POSTED' } })).toBe(1);
        expect(await db.payment.count()).toBe(2);
    });
    it('closed cash period rolls back before any write', async () => {
        await expect(service.create({ ...input(300, 200), cashPaymentDate: new Date('2026-10-01') }, actor)).rejects.toMatchObject({ code: 'FISCAL_PERIOD_CLOSED' });
        await balances(0, 0); expect(await db.barterSettlement.count()).toBe(0);
    });
    it('concurrent void is idempotent and preserves ordinary payment made after barter', async () => {
        const s = await service.create(input(300, 200), actor); await ordinary(100);
        await Promise.all([service.void({ settlementId: s.id, reason: 'Fixture correction' }, actor), service.void({ settlementId: s.id, reason: 'Fixture correction' }, actor)]);
        await balances(100, 0); expect(await db.payment.count()).toBe(1);
        expect(await db.auditLog.count({ where: { action: 'VOID_BARTER_SETTLEMENT' } })).toBe(1);
        expect(await db.journalEntry.count({ where: { status: 'VOIDED' } })).toBe(2);
    });
    it('revocation committed while create waits is re-read and prevents settlement', async () => {
        await expect(blockedBy('BarterPartner', 'partner', () => service.create(input(), actor), async tx => {
            await tx.barterPartner.update({ where: { id: 'partner' }, data: { isActive: false } });
        })).rejects.toMatchObject({ code: 'BARTER_PARTNER_NOT_ACTIVE' });
        await balances(0, 0); expect(await db.payment.count()).toBe(0);
    });
    it('configuration and settlement overlap without deadlock or changing historic identity', async () => {
        const results = await Promise.allSettled([
            service.create(input(300), actor),
            BarterPartnerService.save({ customerId: 'customer', supplierId: 'supplier', isActive: false }, actor),
        ]);
        expect(results[1].status).toBe('fulfilled');
        if (results[0].status === 'rejected') expect(results[0].reason).toMatchObject({ code: 'BARTER_PARTNER_NOT_ACTIVE' });
        expect((await db.barterPartner.findUniqueOrThrow({ where: { id: 'partner' } })).isActive).toBe(false);
        await expect(service.create(input(100), actor)).rejects.toMatchObject({ code: 'BARTER_PARTNER_NOT_ACTIVE' });
    });
    it('isolates identical invoice IDs and idempotency keys across two explicitly guarded databases', async () => {
        await resetFixture(other, 'polyflow_barter_test_2');
        const data = input(300);
        await Promise.all([service.create(data, actor), clients.context.run(other, () => service.create({ ...data, barterAmount: '100' }, actor))]);
        await balances(300, 300);
        expect(Number((await other.invoice.findUniqueOrThrow({ where: { id: 'ar-invoice' } })).paidAmount)).toBe(100);
    });
});
