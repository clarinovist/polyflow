import { PrismaClient } from '@prisma/client'
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage to hold the tenant-specific Prisma Client instance
export const tenantContext = new AsyncLocalStorage<PrismaClient>();

// Tenant Connection Factory (from Phase 1)
const clients: Map<string, PrismaClient> = new Map();

export function getTenantDb(datasourceUrl: string): PrismaClient {
    if (!clients.has(datasourceUrl)) {
        clients.set(
            datasourceUrl,
            new PrismaClient({
                datasources: { db: { url: datasourceUrl } },
            })
        );
    }
    return clients.get(datasourceUrl)!;
}

export async function disconnectAllTenants() {
    const promises = Array.from(clients.values()).map((client) =>
        client.$disconnect()
    );
    await Promise.all(promises);
    clients.clear();
}

// Global Main/Fallback Prisma Client
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const mainPrisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = mainPrisma

/**
 * Global Proxy for Prisma.
 * Whenever `prisma.user.findMany()` is called anywhere in the app, 
 * this Proxy intercepts it and routes it to the correct tenant Database
 * IF it's running inside `tenantContext.run()`.
 * If not, it falls back to the Main DB.
 */
export const prisma = new Proxy(mainPrisma, {
    get(target, prop, receiver) {
        const tenantDb = tenantContext.getStore();
        if (tenantDb) {
            return Reflect.get(tenantDb, prop, receiver);
        }
        return Reflect.get(target, prop, receiver);
    }
});
