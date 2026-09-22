// Runtime contract fixture, NOT migration-history replay. Current Prisma tables plus
// the real SQL ledger/history triggers are needed (db push alone omits these guards).
// Only creates NEW, explicitly allowlisted disposable databases on the CI service.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

if (process.env.CI !== 'true') throw new Error('This fixture is CI-only');
const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
if (!connection) throw new Error('Explicit disposable connection required');
const url = new URL(connection);
if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55439' ||
    url.pathname !== '/polyflow_return_credit_scope_test' ||
    url.search
)
    throw new Error('Only the isolated localhost CI service is allowed');
const names = [
    'polyflow_return_credit_scope_test',
    'polyflow_return_credit_tenant_test',
    'polyflow_return_receipt_scope_test',
];
const migration = (name) =>
    readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8');
const generated = execFileSync(
    'npx',
    [
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--script',
    ],
    { encoding: 'utf8' },
);
// Construct the pre-feature runtime tables, then apply COMPLETE feature migrations.
// This preserves CHECK constraints, partial indexes and triggers, not only ORM shape.
const addedObjects = [
    'SalesReturnReceiptLine',
    'InvoiceReturnBasisLine',
    'SalesReturnCredit',
    'SalesReturnCreditAllocation',
    'SalesReturnCreditStatus',
    'SalesReturnCreditMode',
    'InvoicePriceAdjustment',
    'InvoicePriceAdjustmentStatus',
    'ProductionOrderCustomer',
    'CustomerCreditNote',
    'CustomerCreditApplication',
    'CustomerCreditLink',
];
const schema = generated
    .split(';')
    .filter(
        (statement) =>
            !addedObjects.some((name) => statement.includes(`"${name}"`)),
    )
    .join(';')
    .replace(
        /^\s*"(?:creditedAmount|priceAdjustmentAmount|remainingAmount|commercialSnapshot|requireMeasurement)" [^\n]+\n/gm,
        '',
    );
const guards = [
    '20260918_sales_return_credit',
    '20260919_invoice_commercial_snapshot',
    '20260919_invoice_price_adjustment',
    '20260919_manual_return_credit',
    '20260922_spk_customers_quality',
    '20260922_customer_credit',
]
    .map(migration)
    .join('\n');
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
    for (const name of names) {
        // Never drop/reset an existing DB. A collision fails the CI job.
        await admin.query(`CREATE DATABASE "${name}"`);
        const testUrl = new URL(url);
        testUrl.pathname = `/${name}`;
        const db = new pg.Client({ connectionString: testUrl.toString() });
        await db.connect();
        try {
            await db.query(schema);
            await db.query(guards);
            await db.query(
                `CREATE TABLE "ReturnCreditDisposableMarker" (purpose text NOT NULL)`,
            );
            await db.query(
                `INSERT INTO "ReturnCreditDisposableMarker" VALUES ('return-credit-synthetic-only')`,
            );
        } finally {
            await db.end();
        }
    }
    console.log(
        'Disposable return runtime tables, generated balance and SQL ledger/history triggers ready.',
    );
} finally {
    await admin.end();
}
