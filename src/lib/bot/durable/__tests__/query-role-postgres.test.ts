import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAssistantQueryRolePlan } from '@/lib/ops/assistant-query-role';

/**
 * Least-privilege contract for the brokered assistant query role.
 *
 * Runs only against the disposable assistant CI service. It provisions a real
 * LOGIN role, then proves SELECT works while writes and DDL are refused by
 * PostgreSQL itself — not merely by application code.
 */

const adminUrl = process.env.ASSISTANT_TEST_ADMIN_URL;
const tenantUrl = process.env.ASSISTANT_TEST_TENANT_A_DATABASE_URL;

function guarded(url: string | undefined, expectedPath?: string): URL {
    if (!url) throw new Error('ASSISTANT_QUERY_ROLE_TEST_URL_REQUIRED');
    const parsed = new URL(url);
    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '55440' ||
        parsed.search ||
        (expectedPath && parsed.pathname !== expectedPath)
    ) {
        throw new Error('ASSISTANT_QUERY_ROLE_TEST_FORBIDDEN_TARGET');
    }
    return parsed;
}

const enabled = Boolean(adminUrl && tenantUrl);

const role = `assistant_query_test_${randomBytes(4).toString('hex')}`;
const password = randomBytes(24).toString('hex');

function adminFor(database: string): Client {
    const url = new URL(adminUrl as string);
    url.pathname = `/${database}`;
    return new Client({ connectionString: url.toString() });
}

afterAll(async () => {
    if (!enabled) return;
    // Privileges granted inside a database block DROP ROLE until revoked.
    const tenantDatabase = guarded(tenantUrl).pathname.slice(1);
    const tenantAdmin = adminFor(tenantDatabase);
    await tenantAdmin.connect();
    try {
        await tenantAdmin.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM "${role}"`,
        );
        await tenantAdmin.query(`REVOKE ALL ON DATABASE "${tenantDatabase}" FROM "${role}"`);
        await tenantAdmin.query(`DROP OWNED BY "${role}"`);
    } finally {
        await tenantAdmin.end();
    }
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
        await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    } finally {
        await admin.end();
    }
});

describe.skipIf(!enabled)('assistant query role on disposable PostgreSQL', () => {
    it('grants SELECT but PostgreSQL refuses writes, DDL and escalation', async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        try {
            await admin.query(
                `CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`,
            );
        } finally {
            await admin.end();
        }
        // Grants are per-database: apply while connected to the tenant DB.
        const tenantAdmin = adminFor(guarded(tenantUrl).pathname.slice(1));
        await tenantAdmin.connect();
        try {
            const plan = buildAssistantQueryRolePlan({
                role,
                database: guarded(tenantUrl).pathname.slice(1),
            });
            for (const statement of plan.statements) {
                await tenantAdmin.query(statement);
            }
            const attributes = await tenantAdmin.query<{
                rolsuper: boolean;
                rolcreatedb: boolean;
                rolcreaterole: boolean;
            }>(
                'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1',
                [role],
            );
            expect(attributes.rows[0]).toEqual({
                rolsuper: false,
                rolcreatedb: false,
                rolcreaterole: false,
            });

            const roleUrl = guarded(tenantUrl);
            roleUrl.username = role;
            roleUrl.password = password;
            const reader = new Client({
                connectionString: roleUrl.toString(),
            });
            await reader.connect();
            try {
                const setting = await reader.query<{ ro: string }>(
                    "SELECT current_setting('default_transaction_read_only') AS ro",
                );
                expect(setting.rows[0].ro).toBe('on');

                const selected = await reader.query<{ count: string }>(
                    'SELECT count(*)::text FROM "HelpConversation"',
                );
                expect(Number(selected.rows[0].count)).toBeGreaterThanOrEqual(
                    0,
                );

                await expect(
                    reader.query('INSERT INTO "HelpConversation" DEFAULT VALUES'),
                ).rejects.toMatchObject({ code: '25006' });
                await expect(
                    reader.query('ALTER TABLE "HelpConversation" ADD COLUMN x int'),
                ).rejects.toMatchObject({ code: '25006' });
                await expect(
                    reader.query(
                        `ALTER ROLE "${role}" NOSUPERUSER`,
                    ),
                ).rejects.toMatchObject({ code: '42501' });

                // The session default is clearable by any client; the grant
                // layer must still refuse on its own.
                await reader.query(
                    'SET default_transaction_read_only = off',
                );
                await expect(
                    reader.query('INSERT INTO "HelpConversation" DEFAULT VALUES'),
                ).rejects.toMatchObject({ code: '42501' });
                await expect(
                    reader.query('ALTER TABLE "HelpConversation" ADD COLUMN y int'),
                ).rejects.toMatchObject({ code: '42501' });
            } finally {
                await reader.end();
            }
        } finally {
            await tenantAdmin.end();
        }
    }, 60_000);
});
