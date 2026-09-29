import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { returnTestClient, verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';

// Import the REAL production proxy, client factory, timeout wrapper and audit extension.
// Validate disposable URLs before any connection; never read ambient DATABASE_URL.
const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
let runtime: typeof import('../prisma');
const identity = (client: Pick<Prisma.TransactionClient, '$queryRaw'>) =>
    client.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;

describe.skipIf(!connection)('real Prisma proxy on separate disposable databases', () => {
    beforeAll(async () => {
        const guard = returnTestClient(connection);
        await verifyReturnTestDatabase(guard);
        await guard.$disconnect();
        vi.stubEnv('DATABASE_URL', connection!);
        runtime = await import('../prisma');
        await verifyReturnTestDatabase(runtime.getMainPrisma());
        expect((await identity(runtime.getMainPrisma()))[0].name).toBe('polyflow_return_credit_scope_test');
        const url = new URL(connection!);
        url.pathname = '/polyflow_return_credit_tenant_test';
        const tenant = runtime.getTenantDb(url.toString());
        await verifyReturnTestDatabase(tenant);
        for (const [client, label] of [[runtime.getMainPrisma(), 'MAIN'], [tenant, 'TENANT']] as const) {
            await client.customer.create({ data: { id: 'proxy-routing-fixture', name: label } });
        }
    });
    afterAll(async () => {
        if (runtime) {
            const url = new URL(connection!); url.pathname = '/polyflow_return_credit_tenant_test';
            await runtime.getTenantDb(url.toString()).customer.deleteMany({ where: { id: 'proxy-routing-fixture' } });
            await runtime.getMainPrisma().customer.deleteMany({ where: { id: 'proxy-routing-fixture' } });
            await runtime.disconnectAllTenants();
            await runtime.getMainPrisma().$disconnect();
        }
        vi.unstubAllEnvs();
    });
    function tenantClient() {
        const url = new URL(connection!); url.pathname = '/polyflow_return_credit_tenant_test';
        return runtime.getTenantDb(url.toString());
    }
    it('demonstrates the old unbound receiver reads MAIN, then verifies the production fix', async () => {
        const main = runtime.getMainPrisma();
        const tenant = tenantClient();
        const legacy = new Proxy(main, { get(target, prop, receiver) {
            if (typeof prop === 'string' && prop.startsWith('_')) return Reflect.get(target, prop, receiver);
            return Reflect.get(runtime.tenantContext.getStore() ?? target, prop, receiver);
        } });
        await runtime.tenantContext.run(tenant, async () => {
            expect((await identity(legacy))[0].name).toBe('polyflow_return_credit_scope_test');
            expect((await identity(runtime.prisma))[0].name).toBe('polyflow_return_credit_tenant_test');
            expect((await runtime.prisma.customer.findUniqueOrThrow({ where: { id: 'proxy-routing-fixture' } })).name).toBe('TENANT');
            const raw = await runtime.prisma.$queryRaw<{ name: string }[]>`SELECT name FROM "Customer" WHERE id = 'proxy-routing-fixture'`;
            expect(raw[0].name).toBe('TENANT');
        });
        expect((await identity(runtime.prisma))[0].name).toBe('polyflow_return_credit_scope_test');
    });
    it('isolates concurrent requests and preserves queryRawUnsafe and executeRaw receivers', async () => {
        const targets = [runtime.getMainPrisma(), tenantClient()];
        const result = await Promise.all(targets.map(client => runtime.tenantContext.run(client, async () => {
            await new Promise(resolve => setTimeout(resolve, 1));
            const current = await runtime.prisma.$queryRawUnsafe<{ name: string }[]>('SELECT current_database() AS name');
            await runtime.prisma.$executeRaw`UPDATE "Customer" SET name = name || '-checked' WHERE id = 'proxy-routing-fixture'`;
            return current[0].name;
        })));
        expect(result).toEqual(['polyflow_return_credit_scope_test', 'polyflow_return_credit_tenant_test']);
        expect((await tenantClient().customer.findUniqueOrThrow({ where: { id: 'proxy-routing-fixture' } })).name).toBe('TENANT-checked');
        expect((await runtime.getMainPrisma().customer.findUniqueOrThrow({ where: { id: 'proxy-routing-fixture' } })).name).toBe('MAIN-checked');
    });
    it('keeps interactive and batch transactions on tenant and rolls back writes', async () => {
        await runtime.tenantContext.run(tenantClient(), async () => {
            await expect(runtime.prisma.$transaction(async tx => {
                expect((await identity(tx))[0].name).toBe('polyflow_return_credit_tenant_test');
                await tx.$executeRaw`UPDATE "Customer" SET name = 'must-rollback' WHERE id = 'proxy-routing-fixture'`;
                throw new Error('rollback-probe');
            })).rejects.toThrow('rollback-probe');
            const results = await runtime.prisma.$transaction([runtime.prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`]);
            expect(results[0][0].name).toBe('polyflow_return_credit_tenant_test');
            await expect(runtime.prisma.$transaction(async tx => {
                await tx.$executeRaw`SET TRANSACTION READ ONLY`;
                await tx.$executeRaw`UPDATE "Customer" SET name = 'forbidden' WHERE id = 'proxy-routing-fixture'`;
            }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })).rejects.toThrow(/read-only/);
        });
        expect((await tenantClient().customer.findUniqueOrThrow({ where: { id: 'proxy-routing-fixture' } })).name).toBe('TENANT-checked');
    });
});
