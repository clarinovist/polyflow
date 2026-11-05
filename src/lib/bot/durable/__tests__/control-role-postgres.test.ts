import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
    ASSISTANT_CONTROL_WRITE_TABLES,
    buildAssistantControlRolePlan,
} from '@/lib/ops/assistant-control-role';

/**
 * Contract for the worker's control role on disposable PostgreSQL.
 *
 * Reads stay broad (non-brokered tools read business data), writes must be
 * limited to assistant-owned tables. This proves the privilege layer, not a
 * session default: nothing here sets default_transaction_read_only.
 */

const adminUrl = process.env.ASSISTANT_TEST_ADMIN_URL;
const tenantUrl = process.env.ASSISTANT_TEST_TENANT_A_DATABASE_URL;
const enabled = Boolean(adminUrl && tenantUrl);

function guarded(url: string | undefined): URL {
    if (!url) throw new Error('ASSISTANT_CONTROL_TEST_URL_REQUIRED');
    const parsed = new URL(url);
    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '55440' ||
        parsed.search
    ) {
        throw new Error('ASSISTANT_CONTROL_TEST_FORBIDDEN_TARGET');
    }
    return parsed;
}

const role = `assistant_control_test_${randomBytes(4).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const tenantDatabase = enabled ? guarded(tenantUrl).pathname.slice(1) : '';

function adminFor(database: string): Client {
    const url = new URL(adminUrl as string);
    url.pathname = `/${database}`;
    return new Client({ connectionString: url.toString() });
}

afterAll(async () => {
    if (!enabled) return;
    const admin = adminFor(tenantDatabase);
    await admin.connect();
    try {
        await admin.query(`REVOKE ALL ON DATABASE "${tenantDatabase}" FROM "${role}"`);
        await admin.query(`DROP OWNED BY "${role}"`);
    } finally {
        await admin.end();
    }
    const cluster = new Client({ connectionString: adminUrl });
    await cluster.connect();
    try {
        await cluster.query(`DROP ROLE IF EXISTS "${role}"`);
    } finally {
        await cluster.end();
    }
});

describe.skipIf(!enabled)('assistant control role on disposable PostgreSQL', () => {
    it('reads business data but only writes assistant-owned tables', async () => {
        const cluster = new Client({ connectionString: adminUrl });
        await cluster.connect();
        try {
            await cluster.query(
                `CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`,
            );
        } finally {
            await cluster.end();
        }

        const admin = adminFor(tenantDatabase);
        await admin.connect();
        try {
            const plan = buildAssistantControlRolePlan({
                role,
                database: tenantDatabase,
            });
            for (const statement of plan.statements) {
                await admin.query(statement);
            }
            const attributes = await admin.query<{
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

            const userId = `ctl-user-${randomBytes(6).toString('hex')}`;
            await admin.query(
                `INSERT INTO "User" (id, email, name, password, role, "updatedAt")
                 VALUES ($1, $2, 'Synthetic Control', 'test-only', 'ADMIN', now())`,
                [userId, `${userId}@example.invalid`],
            );

            const url = guarded(tenantUrl);
            url.username = role;
            url.password = password;
            const worker = new Client({ connectionString: url.toString() });
            await worker.connect();
            try {
                await worker.query('SELECT count(*)::text FROM "Product"');

                await expect(
                    worker.query(
                        `INSERT INTO "Product" (id, name, "productType") VALUES ('x','x','FINISHED_GOOD')`,
                    ),
                ).rejects.toMatchObject({ code: '42501' });
                await expect(
                    worker.query('DELETE FROM "Product" WHERE false'),
                ).rejects.toMatchObject({ code: '42501' });
                await expect(
                    worker.query('ALTER TABLE "Product" ADD COLUMN c int'),
                ).rejects.toMatchObject({ code: '42501' });
                if (
                    (
                        await worker.query<{ exists: boolean }>(
                            "SELECT to_regclass('public.\"ApiKey\"') IS NOT NULL AS exists",
                        )
                    ).rows[0].exists
                ) {
                    await expect(
                        worker.query('SELECT * FROM "ApiKey" LIMIT 1'),
                    ).rejects.toMatchObject({ code: '42501' });
                }

                const id = `ctl-${randomBytes(6).toString('hex')}`;
                await worker.query(
                    `INSERT INTO "HelpConversation" (id, "tenantId", "userId", channel, status, "accessScopeHash", "workContextKey", "assistantRuntime")
                     VALUES ($1,'synthetic','synthetic','web','ACTIVE',$2,$3,'pi-durable')`,
                    [id, 'a'.repeat(64), 'work-context'],
                );
                await worker.query(
                    `INSERT INTO "HelpMessage" (id, "conversationId", role, content)
                     VALUES ($1, $2, 'USER', 'synthetic')`,
                    [`${id}-m`, id],
                );
                await worker.query(
                    `INSERT INTO "HelpToolExecution" (id, "conversationId", "toolName", outcome)
                     VALUES ($1, $2, 'synthetic_tool', 'STARTED')`,
                    [`${id}-t`, id],
                );
                await worker.query(
                    `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId")
                     VALUES ($1, $2, 'SYNTHETIC', 'Synthetic', $3)`,
                    [`${id}-a`, userId, id],
                );
                await worker.query(
                    `UPDATE "HelpToolExecution" SET outcome = 'SUCCESS' WHERE "conversationId" = $1`,
                    [id],
                );
                await worker.query(
                    `DELETE FROM "AuditLog" WHERE "entityId" = $1`,
                    [id],
                );
                await worker.query(
                    `DELETE FROM "HelpConversation" WHERE id = $1`,
                    [id],
                );
                await admin.query('DELETE FROM "User" WHERE id = $1', [
                    userId,
                ]);

                // Every granted write table is exactly the assistant allowlist.
                const granted = await admin.query<{ table_name: string }>(
                    `SELECT DISTINCT table_name FROM information_schema.role_table_grants
                     WHERE grantee = $1 AND privilege_type IN ('INSERT','UPDATE','DELETE')
                     ORDER BY table_name`,
                    [role],
                );
                expect(granted.rows.map((row) => row.table_name).sort()).toEqual(
                    [...ASSISTANT_CONTROL_WRITE_TABLES].sort(),
                );
            } finally {
                await worker.end();
            }
        } finally {
            await admin.end();
        }
    }, 60_000);
});
