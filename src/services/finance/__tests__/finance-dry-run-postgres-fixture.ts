import { createHash, randomBytes } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

export const period = { startDate: '2026-08-01', endDate: '2026-08-31' };
export const target = { tenantId: 'dry-tenant', subdomain: 'dry-fixture', databaseName: 'polyflow_recognition_test' };
export function guardedClient(connection: string | undefined, database: string) {
    if (!connection) return undefined;
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.pathname !== `/${database}` || !url.port) throw new Error('Disposable localhost database required');
    return new PrismaClient({ datasources: { db: { url: connection } } });
}
export async function seedFinance(db: PrismaClient, label = 'fixture') {
    await db.$executeRaw`TRUNCATE "User", "RolePermission", "JournalLine", "JournalEntry", "Payment", "Invoice", "SalesOrder", "Customer", "Account", "FiscalPeriod", "Finding", "CeoNote", "TelegramIdentity", "TelegramNotificationPreference", "TelegramNotificationLog" CASCADE`;
    await db.account.createMany({ data: [
        { id: 'ar', code: '11210', name: 'AR candidate', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: 'revenue', code: 'CUSTOM-R', name: 'Revenue', type: 'REVENUE', category: 'OPERATING_REVENUE' },
        { id: 'cogs', code: 'CUSTOM-C', name: 'COGS', type: 'EXPENSE', category: 'COGS' },
    ] });
    await db.customer.create({ data: { id: 'customer', name: label } });
    await db.salesOrder.create({ data: { id: 'order', orderNumber: 'SO-FIXTURE', customerId: 'customer', totalAmount: 100 } });
    await db.invoice.create({ data: { id: 'invoice', invoiceNumber: `INV-${label}`, salesOrderId: 'order', totalAmount: 100, paidAmount: 100, status: 'PAID', invoiceDate: new Date('2026-08-15T00:00:00Z') } });
    await db.payment.create({ data: { id: 'payment', paymentNumber: 'PAY-FIXTURE', paymentDate: new Date('2026-08-16T00:00:00Z'), amount: 80, method: 'Cash', invoiceId: 'invoice' } });
    await db.fiscalPeriod.create({ data: { name: 'August', year: 2026, month: 8, startDate: new Date('2026-07-31T17:00:00Z'), endDate: new Date('2026-08-31T16:59:59.999Z'), status: 'CLOSED' } });
    await entry(db, 'SALE', 'revenue', -100, { status: 'DRAFT', referenceType: 'SALES_INVOICE', referenceId: 'invoice' });
    await entry(db, 'COGS-START', 'cogs', 30, { entryDate: new Date('2026-07-31T17:00:00Z') });
    await entry(db, 'COGS-END', 'cogs', -4, { entryDate: new Date('2026-08-31T16:59:59.999Z') });
    await entry(db, 'COGS-OUTSIDE', 'cogs', 999, { entryDate: new Date('2026-08-31T17:00:00Z') });
    await entry(db, 'COGS-NULL', 'cogs', 999, { reference: null });
    await entry(db, 'COGS-CLOSING', 'cogs', 999, { reference: 'CLOSING-TEST' });
    await db.user.create({ data: { id: 'finance-user', email: 'fixture@example.invalid', password: randomBytes(24).toString('hex'), role: 'FINANCE' } });
    await db.rolePermission.create({ data: { role: 'FINANCE', resource: '/finance', canAccess: true } });
    await db.telegramIdentity.create({ data: { id: 'identity', tenantId: target.tenantId, userId: 'finance-user', telegramUserId: 'synthetic-user', telegramChatId: 'synthetic-chat' } });
    await db.telegramNotificationPreference.create({ data: { tenantId: target.tenantId, userId: 'finance-user', enabled: true, dailyDigest: true } });
}
export async function entry(db: PrismaClient, id: string, accountId: string, net: number, overrides: Partial<Prisma.JournalEntryCreateInput> = {}) {
    await db.journalEntry.create({ data: { id, entryNumber: id, entryDate: new Date('2026-08-15T00:00:00Z'), description: 'Synthetic fixture', reference: id, status: 'POSTED',
        lines: { create: [{ accountId, debit: Math.max(0, net), credit: Math.max(0, -net) }, { accountId: 'ar', debit: Math.max(0, -net), credit: Math.max(0, net) }] }, ...overrides } });
}
export async function databaseFingerprint(db: PrismaClient) {
    const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    const hashes = await Promise.all(tables.map(async ({ tablename }) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tablename)) throw new Error('Invalid fixture table');
        const identifier = Prisma.raw(`"${tablename}"`);
        const [row] = await db.$queryRaw<{ hash: string; count: bigint }[]>(Prisma.sql`SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS hash, COUNT(*) AS count FROM ${identifier} t`);
        return { table: tablename, hash: row.hash, count: Number(row.count) };
    }));
    return { tables: hashes.length, digest: createHash('sha256').update(JSON.stringify(hashes)).digest('hex') };
}
export async function sqlObservation(db: PrismaClient) {
    const rows = await db.$queryRaw<{ query: string; calls: bigint }[]>`SELECT query, calls FROM pg_stat_statements WHERE query NOT LIKE '%pg_stat_statements%'`;
    return { statements: rows.reduce((n, row) => n + Number(row.calls), 0),
        writes: rows.filter(r => /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE\s+|CREATE\s+|ALTER\s+|DROP\s+|GRANT\s+|REVOKE\s+|MERGE\s+|COPY\s+)/i.test(r.query)).reduce((n, r) => n + Number(r.calls), 0),
        unclassified: rows.filter(r => !/^\s*(SELECT|WITH|SET|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(r.query)).map(r => r.query.split(/\s+/)[0]),
    };
}
