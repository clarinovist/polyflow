import { describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client', () => ({
    PrismaClient: class {
        _identity: string;
        constructor(options?: { datasources: { db: { url: string } } }) {
            this._identity = options?.datasources.db.url ?? 'main';
            Object.defineProperty(this, '_extensions', { value: this._identity, configurable: false, writable: false });
        }
        $extends() { return this; }
        _request() { return this._identity; }
        $queryRaw() { return this._request(); }
        $executeRaw() { return this._request(); }
        $transaction(fn: (client: unknown) => unknown) { return fn(this); }
        $disconnect() { return Promise.resolve(); }
    },
}));
import { getTenantDb, getMainPrisma, prisma, tenantContext } from '../prisma';

describe('Prisma proxy method receiver', () => {
    it('routes raw public methods to the concrete tenant, not main internal properties', async () => {
        const tenant = getTenantDb('tenant-a');
        await tenantContext.run(tenant, async () => {
            expect(await prisma.$queryRaw`SELECT 1`).toBe('tenant-a');
            expect(await prisma.$executeRaw`SELECT 1`).toBe('tenant-a');
        });
        expect(await prisma.$queryRaw`SELECT 1`).toBe('main');
    });
    it('preserves the non-configurable internal property invariant', () => {
        tenantContext.run(getTenantDb('tenant-a'), () => {
            expect(Reflect.get(prisma, '_extensions')).toBe(Reflect.get(getMainPrisma(), '_extensions'));
        });
    });
    it('keeps concurrent asynchronous contexts separate', async () => {
        const result = await Promise.all(['tenant-a', 'tenant-b'].map(name =>
            tenantContext.run(getTenantDb(name), async () => {
                await Promise.resolve();
                return prisma.$queryRaw`SELECT 1`;
            })));
        expect(result).toEqual(['tenant-a', 'tenant-b']);
    });
});
