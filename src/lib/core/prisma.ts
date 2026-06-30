import { PrismaClient } from '@prisma/client'
import { AsyncLocalStorage } from 'async_hooks';

// Default transaction timeout — complex operations (production backflush, period close)
// were exceeding the Prisma default of 5s (observed: 5076ms, 5087ms).
const TX_TIMEOUT_MS = 15_000;

/** Extend a PrismaClient with a default transaction timeout. */
function withTxTimeout(client: PrismaClient): PrismaClient {
    const originalTx = client.$transaction.bind(client);
    // Intercept interactive transactions (function form) to inject default timeout
    const c = client as unknown as Record<string, unknown>;
    c.$transaction = (arg: unknown, opts?: Record<string, unknown>) => {
        if (typeof arg === 'function') {
            return originalTx(arg as Parameters<typeof originalTx>[0], { timeout: TX_TIMEOUT_MS, ...opts });
        }
        return originalTx(arg as Parameters<typeof originalTx>[0], opts as Parameters<typeof originalTx>[1]);
    };
    return client;
}

// AsyncLocalStorage to hold the tenant-specific Prisma Client instance
// MUST be a global singleton — Next.js standalone builds can duplicate module
// instances across SSR chunks, causing context leaks between requests.
const globalForTenantContext = globalThis as unknown as {
    __polyflowTenantContext?: AsyncLocalStorage<PrismaClient>;
};
export const tenantContext: AsyncLocalStorage<PrismaClient> =
    globalForTenantContext.__polyflowTenantContext ??
    (globalForTenantContext.__polyflowTenantContext = new AsyncLocalStorage<PrismaClient>());

// Tenant Connection Factory — MUST be global singleton
const globalForTenantClients = globalThis as unknown as {
    __polyflowTenantClients?: Map<string, PrismaClient>;
};
const clients: Map<string, PrismaClient> =
    globalForTenantClients.__polyflowTenantClients ??
    (globalForTenantClients.__polyflowTenantClients = new Map<string, PrismaClient>());

export function getTenantDb(datasourceUrl: string): PrismaClient {
    if (!clients.has(datasourceUrl)) {
        const client = new PrismaClient({
            datasources: { db: { url: datasourceUrl } },
        });
        clients.set(datasourceUrl, withTxTimeout(client));
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

// Global Main/Fallback Prisma Client — MUST be global singleton in all environments
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const mainPrisma = globalForPrisma.prisma || withTxTimeout(new PrismaClient())

// Always cache on globalThis — prevents duplicate clients across SSR chunks
globalForPrisma.prisma = mainPrisma

/**
 * Access the main (non-tenant) Prisma client directly.
 * Use this for queries that MUST run on the main database
 * (e.g. tenant lookup) regardless of AsyncLocalStorage context state.
 */
export function getMainPrisma(): PrismaClient {
    return mainPrisma;
}

/**
 * Global Proxy for Prisma.
 * Whenever `prisma.user.findMany()` is called anywhere in the app, 
 * this Proxy intercepts it and routes it to the correct tenant Database
 * IF it's running inside `tenantContext.run()`.
 * If not, it falls back to the Main DB.
 * 
 * MUST be a global singleton — if different SSR chunks create separate
 * proxies, each imports its own `tenantContext` and context routing breaks.
 */
const globalForPrismaProxy = globalThis as unknown as {
    __polyflowPrismaProxy?: typeof mainPrisma;
};
export const prisma: typeof mainPrisma =
    globalForPrismaProxy.__polyflowPrismaProxy ??
    (globalForPrismaProxy.__polyflowPrismaProxy = new Proxy(mainPrisma, {
        get(target, prop, receiver) {
            const tenantDb = tenantContext.getStore();
            if (tenantDb) {
                return Reflect.get(tenantDb, prop, receiver);
            }
            return Reflect.get(target, prop, receiver);
        }
    }));
