import { vi } from 'vitest';

export function createMockPrisma() {
    const mockDb = {
        $transaction: vi.fn().mockImplementation(async (arg) => {
            if (Array.isArray(arg)) {
                return Promise.all(arg);
            }
            if (typeof arg === 'function') {
                return await arg(mockDb);
            }
            return arg;
        }),
        journalEntry: {
            create: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
        },
        journalLine: {
            create: vi.fn(),
            createMany: vi.fn(),
            findMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        account: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        accountingJournal: {
            create: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn()
        },
        accountingJournalItem: {
            create: vi.fn(),
            createMany: vi.fn(),
            findMany: vi.fn(),
        },
        purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
        inventoryTransaction: { create: vi.fn(), createMany: vi.fn() },
        productVariant: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
        inventory: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
        productionOrder: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
        productionExecution: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUniqueOrThrow: vi.fn() },
        salesOrder: { findUnique: vi.fn(), update: vi.fn() },
        auditLog: { create: vi.fn() },
        machine: { findUnique: vi.fn() },
        productionScrap: { create: vi.fn() },
        scrapRecord: { create: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
        stockMovement: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
        materialIssue: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
        location: { findUnique: vi.fn() },
        batch: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() }
    };
    
    return mockDb;
}
