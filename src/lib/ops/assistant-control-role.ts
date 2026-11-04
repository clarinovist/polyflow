/**
 * Control-plane role for the assistant worker.
 *
 * The worker still needs PostgreSQL for authority, admission, projection and
 * audit. This role keeps that access while removing write access to tenant
 * business tables: reads are allowed (tools need them), writes are limited to
 * assistant-owned tables.
 */

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/** Tables the worker is allowed to write. Everything else is SELECT-only. */
export const ASSISTANT_CONTROL_WRITE_TABLES = [
    'AuditLog',
    'HelpConversation',
    'HelpMessage',
    'HelpToolExecution',
] as const;

export type AssistantControlRolePlanInput = {
    role: string;
    database: string;
    schema?: string;
    statementTimeoutMs?: number;
    lockTimeoutMs?: number;
};

export type AssistantControlRolePlan = {
    role: string;
    database: string;
    schema: string;
    statements: readonly string[];
};

export function assertControlRoleIdentifier(
    value: string,
    label: string,
): string {
    if (!IDENTIFIER.test(value)) {
        throw new Error(
            `ASSISTANT_CONTROL_ROLE_INVALID_${label.toUpperCase()}`,
        );
    }
    return value;
}

export function assertDedicatedControlRole(role: string): string {
    if (role === 'postgres' || role === 'polyflow') {
        throw new Error('ASSISTANT_CONTROL_ROLE_MUST_BE_DEDICATED');
    }
    return role;
}

function quoteIdent(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export function buildAssistantControlRolePlan(
    input: AssistantControlRolePlanInput,
): AssistantControlRolePlan {
    const role = assertDedicatedControlRole(
        assertControlRoleIdentifier(input.role, 'role'),
    );
    const database = assertControlRoleIdentifier(input.database, 'database');
    const schema = assertControlRoleIdentifier(
        input.schema ?? 'public',
        'schema',
    );
    const statementTimeout = Math.min(
        Math.max(input.statementTimeoutMs ?? 10_000, 1_000),
        30_000,
    );
    const lockTimeout = Math.min(
        Math.max(input.lockTimeoutMs ?? 2_000, 500),
        10_000,
    );
    const roleId = quoteIdent(role);
    const schemaId = quoteIdent(schema);
    const databaseId = quoteIdent(database);
    const writeTables =
        ASSISTANT_CONTROL_WRITE_TABLES.map(quoteIdent).join(', ');

    return {
        role,
        database,
        schema,
        statements: [
            `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(role)}) THEN
    CREATE ROLE ${roleId} LOGIN;
  END IF;
END
$$;`,
            `ALTER ROLE ${roleId} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
            `ALTER ROLE ${roleId} SET statement_timeout = ${quoteLiteral(`${statementTimeout}ms`)};`,
            `ALTER ROLE ${roleId} SET lock_timeout = ${quoteLiteral(`${lockTimeout}ms`)};`,
            `ALTER ROLE ${roleId} SET idle_in_transaction_session_timeout = '15s';`,
            `REVOKE ALL ON DATABASE ${databaseId} FROM ${roleId};`,
            `GRANT CONNECT ON DATABASE ${databaseId} TO ${roleId};`,
            `REVOKE ALL ON SCHEMA ${schemaId} FROM ${roleId};`,
            `GRANT USAGE ON SCHEMA ${schemaId} TO ${roleId};`,
            // Reads stay broad: non-brokered tools still read business data.
            `GRANT SELECT ON ALL TABLES IN SCHEMA ${schemaId} TO ${roleId};`,
            `GRANT SELECT ON ALL SEQUENCES IN SCHEMA ${schemaId} TO ${roleId};`,
            // Remove every write privilege first, then restore it only for
            // assistant-owned tables. No default privileges are added, so a
            // future business table never becomes writable implicitly.
            `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA ${schemaId} FROM ${roleId};`,
            `GRANT INSERT, UPDATE, DELETE ON TABLE ${writeTables} TO ${roleId};`,
        ],
    };
}

export function buildAssistantControlRoleVerificationSql(
    input: Pick<AssistantControlRolePlanInput, 'role'>,
): string {
    const role = assertControlRoleIdentifier(input.role, 'role');
    return `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin,
       rolreplication, rolbypassrls, rolconfig
FROM pg_roles WHERE rolname = ${quoteLiteral(role)};`;
}
