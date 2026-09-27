import { execFileSync } from 'node:child_process';
import pg from 'pg';

if (process.env.CI !== 'true') throw new Error('This fixture is CI-only');
const raw = process.env.CENTRAL_IDENTITY_TEST_ADMIN_URL;
if (!raw) throw new Error('CENTRAL_IDENTITY_TEST_ADMIN_URL is required');
const adminUrl = new URL(raw);
if (
    adminUrl.protocol !== 'postgresql:' ||
    adminUrl.hostname !== '127.0.0.1' ||
    adminUrl.port !== '55439' ||
    adminUrl.pathname !== '/postgres' ||
    adminUrl.search
) {
    throw new Error('Only the isolated localhost CI service is allowed');
}

const databases = [
    'polyflow_central_main_test',
    'polyflow_central_tenant_a_test',
    'polyflow_central_tenant_b_test',
];
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
    for (const database of databases) {
        // Never drop/reset an existing DB. A collision fails the CI job.
        await admin.query(`CREATE DATABASE "${database}"`);
        const target = new URL(adminUrl);
        target.pathname = `/${database}`;
        // Migration history predates some production-baseline columns, so this
        // disposable contract uses Prisma's current schema. The feature's raw
        // SQL migration itself is separately applied by migrate deploy in the
        // production release path and reviewed in source.
        execFileSync(
            'npx',
            ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'],
            {
                env: { ...process.env, DATABASE_URL: target.toString() },
                stdio: 'inherit',
            },
        );
    }
} finally {
    await admin.end();
}
console.log('Disposable MAIN and two tenant identity databases are ready.');
