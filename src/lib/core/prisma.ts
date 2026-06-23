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
export const tenantContext = new AsyncLocalStorage<PrismaClient>();

// Tenant Connection Factory (from Phase 1)
const clients: Map<string, PrismaClient> = new Map();

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

// Global Main/Fallback Prisma Client
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const mainPrisma = globalForPrisma.prisma || withTxTimeout(new PrismaClient())

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
