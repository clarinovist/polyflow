import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (process.env.CI !== 'true') throw new Error('This fixture is CI-only');
const adminConnection = process.env.ASSISTANT_TEST_ADMIN_URL;
if (!adminConnection) throw new Error('Explicit disposable admin URL required');
const adminUrl = new URL(adminConnection);
if (
    !['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
    adminUrl.hostname !== '127.0.0.1' ||
    adminUrl.port !== '55440' ||
    adminUrl.pathname !== '/postgres' ||
    adminUrl.search
)
    throw new Error('Only the isolated assistant CI service is allowed');

const names = [
    'polyflow_assistant_main_test',
    'polyflow_assistant_tenant_a_test',
    'polyflow_assistant_tenant_b_test',
];
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
    for (const name of names) await admin.query(`CREATE DATABASE "${name}"`);
} finally {
    await admin.end();
}
for (const name of names) {
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    execFileSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        {
            stdio: 'inherit',
            env: { ...process.env, DATABASE_URL: url.toString() },
        },
    );
}
console.log('Disposable assistant main and tenant databases are ready.');
