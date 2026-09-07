import { BusinessRuleError } from '@/lib/errors/errors';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getMainPrisma, getTenantDb, tenantContext, tenantIdContext } from '@/lib/core/prisma';

// Internal manual runner only. Never expose target selection as an AI tool or HTTP argument.
const targetSchema = z.object({
    tenantId: z.string().trim().min(1).max(128),
    subdomain: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(63),
    databaseName: z.string().regex(/^[a-zA-Z0-9_]+$/).max(63),
}).strict();
type Target = z.infer<typeof targetSchema>;
type Snapshot = Readonly<{ tenant: Target; tx: Prisma.TransactionClient; checkedAt: Date }>;
const snapshots = new AsyncLocalStorage<Snapshot>();
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 12_000, maxWait: 2_000 };

async function readRegistry(target: Target) {
    return getMainPrisma().$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const [main] = await tx.$queryRaw<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`;
        const tenant = await tx.tenant.findUnique({
            where: { subdomain: target.subdomain },
            select: { id: true, subdomain: true, status: true, dbUrl: true },
        });
        if (!main || main.databaseName === target.databaseName || !tenant || tenant.status !== 'ACTIVE'
            || tenant.id !== target.tenantId || tenant.subdomain !== target.subdomain) throw new BusinessRuleError('Invalid target');
        const url = new URL(tenant.dbUrl);
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname
            || decodeURIComponent(url.pathname) !== `/${target.databaseName}`) throw new BusinessRuleError('Invalid database');
        const entitlement = await tx.tenantModule.findFirst({
            where: { tenantId: tenant.id, moduleKey: 'FINANCE', status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            select: { id: true },
        });
        if (!entitlement) throw new BusinessRuleError('Missing entitlement');
        return tenant.dbUrl;
    }, transactionOptions);
}

/** Fail closed even when a caller manually supplies otherwise plausible ALS stores. */
export function requireFinanceDryRunSnapshot(): Snapshot {
    const snapshot = snapshots.getStore();
    if (!snapshot || tenantContext.getStore() !== snapshot.tx || tenantIdContext.getStore() !== snapshot.tenant.tenantId) {
        throw new BusinessRuleError('Snapshot tenant dry-run tidak aktif atau tidak cocok.');
    }
    return snapshot;
}

async function inspectTenant<T>(target: Target, url: string, inspect: () => Promise<T>): Promise<T> {
    return getTenantDb(url).$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const [state] = await tx.$queryRaw<{ databaseName: string; readOnly: string; isolation: string }[]>`
            SELECT current_database() AS "databaseName", current_setting('transaction_read_only') AS "readOnly",
                current_setting('transaction_isolation') AS isolation`;
        if (!state || state.databaseName !== target.databaseName || state.readOnly !== 'on' || state.isolation !== 'repeatable read') {
            throw new BusinessRuleError('Unverified snapshot');
        }
        // Bind root methods: the legacy global proxy forwards methods with its own receiver.
        // Without binding, raw SQL can use the outer/main client despite a transaction in ALS.
        const boundTx = new Proxy(tx, {
            get(client, key) {
                const value = Reflect.get(client, key);
                return typeof value === 'function' ? value.bind(client) : value;
            },
        });
        const snapshot: Snapshot = { tenant: target, tx: boundTx, checkedAt: new Date() };
        // The ALS legacy type is PrismaClient; nested transactions are intentionally unavailable.
        return tenantContext.run(boundTx as PrismaClient, () => tenantIdContext.run(target.tenantId, () => snapshots.run(snapshot, inspect)));
    }, transactionOptions);
}

export async function withFinanceDryRunTenant<T>(rawTarget: unknown, inspect: () => Promise<T>): Promise<T> {
    const target = targetSchema.parse(rawTarget);
    if (tenantContext.getStore() || tenantIdContext.getStore()) throw new BusinessRuleError('Konteks tenant sudah aktif; dry-run tidak boleh mengganti tenant.');
    try {
        const url = await readRegistry(target);
        return await inspectTenant(target, url, inspect);
    } catch {
        // No audit/delivery helper here. DB errors can contain connection strings or business data.
        throw new BusinessRuleError('Pemeriksaan dry-run gagal diverifikasi.');
    }
}
