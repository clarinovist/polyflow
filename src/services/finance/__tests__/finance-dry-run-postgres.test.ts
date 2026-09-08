import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { guardedClient, seedFinance, target, period, databaseFingerprint, sqlObservation, entry } from './finance-dry-run-postgres-fixture';
import { withFinanceDryRunTenant, requireFinanceDryRunSnapshot } from '../finance-dry-run-tenant';
import { runFinanceDryRun } from '../finance-dry-run-service';
import { getMainPrisma, disconnectAllTenants, prisma, tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { isFeatureEnabled } from '@/lib/bot/feature-flags';
import { evidenceToText } from '@/lib/bot/evidence';

const enabled = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_REGISTRY_URL;
const db = guardedClient(process.env.TEST_DATABASE_URL, target.databaseName)!;
const registry = guardedClient(process.env.TEST_REGISTRY_URL, 'polyflow_registry_test')!;
const other = guardedClient(process.env.TEST_OTHER_URL, target.databaseName)!;
if (enabled && process.env.DATABASE_URL !== process.env.TEST_REGISTRY_URL) throw new Error('Main database must be disposable registry');
const run = () => withFinanceDryRunTenant(target, () => runFinanceDryRun(period));

describe.skipIf(!enabled)('finance dry-run real PostgreSQL boundary', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External delivery forbidden'));
    const httpSpy = vi.spyOn(http, 'request').mockImplementation(() => { throw new Error('HTTP forbidden'); });
    const httpsSpy = vi.spyOn(https, 'request').mockImplementation(() => { throw new Error('HTTPS forbidden'); });
    beforeAll(async () => {
        await registry.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`;
        await db.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`;
    });
    beforeEach(async () => {
        vi.clearAllMocks();
        await registry.$executeRaw`TRUNCATE "Tenant" CASCADE`;
        await registry.tenant.create({ data: { id: target.tenantId, name: 'Synthetic', subdomain: target.subdomain, dbUrl: process.env.TEST_DATABASE_URL! } });
        await registry.tenantModule.create({ data: { tenantId: target.tenantId, moduleKey: 'FINANCE' } });
        await seedFinance(db);
    });
    afterEach(() => {
        expect(fetchSpy).not.toHaveBeenCalled(); expect(httpSpy).not.toHaveBeenCalled(); expect(httpsSpy).not.toHaveBeenCalled();
    });
    afterAll(async () => {
        vi.restoreAllMocks();
        await disconnectAllTenants();
        await Promise.all([db.$disconnect(), registry.$disconnect(), other?.$disconnect(), getMainPrisma().$disconnect()]);
    });
    it('performs actual finance reads with zero DML, unchanged full databases and zero network delivery', async () => {
        const before = await Promise.all([databaseFingerprint(db), databaseFingerprint(registry)]);
        await db.$queryRaw`SELECT pg_stat_statements_reset()::text`;
        const result = await run();
        const observations = await sqlObservation(db);
        expect(observations.statements).toBeGreaterThan(10);
        expect(observations.writes).toBe(0); expect(observations.unclassified).toEqual([]);
        const after = await Promise.all([databaseFingerprint(db), databaseFingerprint(registry)]);
        expect(after).toEqual(before);
        expect(result.journals.items.some(i => i.entityKey.includes('SALES_INVOICE_UNPOSTED'))).toBe(true);
        expect(result.journals.items.some(i => i.entityKey.includes('SALES_PAYMENT'))).toBe(true);
        const text = evidenceToText(result.reconciliation);
        expect(text).toContain('Rp 1.025,00'); expect(text).toContain('Payment Rp 80,00');
        expect(text).toContain('BUKAN tambahan laba'); expect(text).toContain('Reference NULL');
        expect(result.recipients.candidates[0].eligible).toBe(true);
        expect(result.rollout.allowed).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled(); expect(httpSpy).not.toHaveBeenCalled(); expect(httpsSpy).not.toHaveBeenCalled();
        for (const flag of ['assistant.proactiveDigest', 'assistant.findingLifecycle', 'assistant.ceoNotes'] as const) expect(isFeatureEnabled(flag)).toBe(false);
        if (process.env.DRY_RUN_EVIDENCE_PATH) writeFileSync(process.env.DRY_RUN_EVIDENCE_PATH, JSON.stringify({ result, proof: { before, after, observations, externalDeliveryAttempts: fetchSpy.mock.calls.length + httpSpy.mock.calls.length + httpsSpy.mock.calls.length } }, null, 2), { mode: 0o600 });
    });
    it('proves SQL observation catches a real fixture CTE mutation', async () => {
        await db.$queryRaw`SELECT pg_stat_statements_reset()::text`;
        await db.$queryRaw`WITH changed AS (UPDATE "Invoice" SET "paidAmount" = 70 WHERE id = 'invoice' RETURNING id) SELECT id FROM changed`;
        expect((await sqlObservation(db)).writes).toBeGreaterThan(0);
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).paidAmount)).toBe(70);
    });
    it('PostgreSQL rejects writes through both explicit tx and ambient proxy; snapshot remains alive', async () => {
        const before = await databaseFingerprint(db);
        await withFinanceDryRunTenant(target, async () => {
            const { tx } = requireFinanceDryRunSnapshot();
            const [settings] = await tx.$queryRaw<{ ro: string; isolation: string }[]>`SELECT current_setting('transaction_read_only') ro, current_setting('transaction_isolation') isolation`;
            expect(settings).toEqual({ ro: 'on', isolation: 'repeatable read' });
            await tx.$executeRaw`SAVEPOINT write_probe`;
            await expect(tx.invoice.update({ where: { id: 'invoice' }, data: { paidAmount: 999 } })).rejects.toThrow(/read-only/);
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT write_probe`;
            await expect(prisma.$executeRaw`DELETE FROM "Invoice" WHERE id = 'invoice'`).rejects.toThrow(/read-only/);
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT write_probe`;
            expect(tenantContext.getStore()).toBe(tx); expect(tenantIdContext.getStore()).toBe(target.tenantId);
            expect((await runFinanceDryRun(period)).journals.items.length).toBeGreaterThan(0);
        });
        expect(await databaseFingerprint(db)).toEqual(before);
    });
    it('keeps failed SQL inspection sanitized and business data unchanged', async () => {
        const before = await Promise.all([databaseFingerprint(db), databaseFingerprint(registry)]);
        await expect(withFinanceDryRunTenant(target, async () => requireFinanceDryRunSnapshot().tx.$queryRaw`SELECT 1/0`)).rejects.toThrow(/^Pemeriksaan dry-run gagal diverifikasi\.$/);
        expect(await Promise.all([databaseFingerprint(db), databaseFingerprint(registry)])).toEqual(before);
    });
    it('preserves truncation and full cohort aggregates without lifecycle writes', async () => {
        await db.invoice.createMany({ data: Array.from({ length: 501 }, (_, n) => ({ id: `bulk-${n}`, invoiceNumber: `BULK-${n}`, salesOrderId: 'order', totalAmount: 10, status: 'PAID', invoiceDate: new Date('2026-08-15T00:00:00Z') })) });
        const before = await databaseFingerprint(db);
        const result = await run();
        expect(result.journals.status).toBe('truncated'); expect(result.journals.items).toHaveLength(500);
        expect(result.reconciliation.completeness).toBe('partial');
        expect(evidenceToText(result.reconciliation)).toContain('502 invoice');
        expect(await databaseFingerprint(db)).toEqual(before);
    });
    it('repeated runs never consume dedup or create lifecycle records and preserve recipient exclusions', async () => {
        await db.user.update({ where: { id: 'finance-user' }, data: { isActive: false } });
        const before = await databaseFingerprint(db);
        const first = await run(); const second = await run();
        expect(first.recipients.candidates[0].reasons).toContain('USER_INACTIVE');
        expect(second.recipients).toEqual(first.recipients);
        expect(await databaseFingerprint(db)).toEqual(before);
    });
    it('detects duplicate posted and invalid document states without changing closed periods', async () => {
        await entry(db, 'SALE-POSTED-1', 'revenue', -100, { referenceType: 'SALES_INVOICE', referenceId: 'invoice' });
        await entry(db, 'SALE-POSTED-2', 'revenue', -100, { referenceType: 'SALES_INVOICE', referenceId: 'invoice' });
        await db.invoice.update({ where: { id: 'invoice' }, data: { status: 'CANCELLED' } });
        const before = await databaseFingerprint(db);
        const result = await run();
        expect(evidenceToText(result.reconciliation)).toContain('CANCELLED');
        expect(evidenceToText(result.reconciliation)).toContain('POSTED 2');
        expect(await databaseFingerprint(db)).toEqual(before);
    });
    it('rejects expired entitlements and wrong database identities before inspecting business data', async () => {
        await registry.tenantModule.updateMany({ data: { expiresAt: new Date('2000-01-01T00:00:00Z') } });
        await expect(run()).rejects.toThrow(/verifikasi/);
        await registry.tenantModule.updateMany({ data: { expiresAt: null } });
        await registry.tenant.update({ where: { id: target.tenantId }, data: { dbUrl: process.env.TEST_REGISTRY_URL! } });
        await expect(run()).rejects.toThrow(/verifikasi/);
    });
    it.skipIf(!other)('isolates two concurrent tenant snapshots using real ALS and distinct databases', async () => {
        const targetB = { ...target, tenantId: 'dry-other', subdomain: 'dry-other' };
        await seedFinance(other, 'other');
        await registry.tenant.create({ data: { id: targetB.tenantId, name: 'Other synthetic', subdomain: targetB.subdomain, dbUrl: process.env.TEST_OTHER_URL! } });
        await registry.tenantModule.create({ data: { tenantId: targetB.tenantId, moduleKey: 'FINANCE' } });
        const [a, b] = await Promise.all([run(), withFinanceDryRunTenant(targetB, () => runFinanceDryRun(period))]);
        expect(evidenceToText(a.reconciliation)).toContain('INV-fixture');
        expect(evidenceToText(a.reconciliation)).not.toContain('INV-other');
        expect(evidenceToText(b.reconciliation)).toContain('INV-other');
        expect(evidenceToText(b.reconciliation)).not.toContain('INV-fixture');
        expect(tenantContext.getStore()).toBeUndefined();
    });
    it.skipIf(!process.env.DRY_RUN_MANUAL_BUNDLE)('executes the manual entrypoint end to end outside Vitest mocks', async () => {
        const before = await Promise.all([databaseFingerprint(db), databaseFingerprint(registry)]);
        await db.$queryRaw`SELECT pg_stat_statements_reset()::text`;
        const output = execFileSync(process.execPath, [process.env.DRY_RUN_MANUAL_BUNDLE!], { env: { ...process.env, DRY_RUN_TARGET: JSON.stringify(target), DRY_RUN_PERIOD: JSON.stringify(period) }, encoding: 'utf8' });
        const result = JSON.parse(output);
        expect(result.mode).toBe('dry-run'); expect(result.journals.items.length).toBeGreaterThan(0);
        expect(result.networkAttempts).toBe(0);
        expect((await sqlObservation(db)).writes).toBe(0);
        expect(await Promise.all([databaseFingerprint(db), databaseFingerprint(registry)])).toEqual(before);
    });
});
