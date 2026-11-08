/**
 * Least-privilege PostgreSQL role for brokered assistant queries.
 *
 * The generated statements are idempotent and additive. Passwords are never
 * generated or printed here: an operator sets the credential separately, and
 * this module only shapes role attributes, session defaults, and grants.
 */

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

export type AssistantQueryRolePlanInput = {
    role: string;
    database: string;
    schema?: string;
    statementTimeoutMs?: number;
    lockTimeoutMs?: number;
};

export type AssistantQueryRolePlan = {
    role: string;
    database: string;
    schema: string;
    statements: readonly string[];
};

function assertAssistantQueryRoleIdentifier(
    value: string,
    label: string,
): string {
    if (!IDENTIFIER.test(value)) {
        throw new Error(`ASSISTANT_QUERY_ROLE_INVALID_${label.toUpperCase()}`);
    }
    return value;
}

/** `postgres` must never be the query role target. */
function assertNotSuperuserRole(role: string): string {
    if (role === 'postgres' || role === 'polyflow') {
        throw new Error('ASSISTANT_QUERY_ROLE_MUST_BE_DEDICATED');
    }
    return role;
}

function quoteIdent(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export function buildAssistantQueryRolePlan(
    input: AssistantQueryRolePlanInput,
): AssistantQueryRolePlan {
    const role = assertNotSuperuserRole(
        assertAssistantQueryRoleIdentifier(input.role, 'role'),
    );
    const database = assertAssistantQueryRoleIdentifier(
        input.database,
        'database',
    );
    const schema = assertAssistantQueryRoleIdentifier(
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

    const statements = [
        `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(role)}) THEN
    CREATE ROLE ${roleId} LOGIN;
  END IF;
END
$$;`,
        `ALTER ROLE ${roleId} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
        // Session default is convenience only; GRANT/REVOKE below is the real
        // boundary because a client can clear this setting.
        `ALTER ROLE ${roleId} SET default_transaction_read_only = on;`,
        `ALTER ROLE ${roleId} SET statement_timeout = ${quoteLiteral(`${statementTimeout}ms`)};`,
        `ALTER ROLE ${roleId} SET lock_timeout = ${quoteLiteral(`${lockTimeout}ms`)};`,
        `ALTER ROLE ${roleId} SET idle_in_transaction_session_timeout = '15s';`,
        `REVOKE ALL ON DATABASE ${databaseId} FROM ${roleId};`,
        `GRANT CONNECT ON DATABASE ${databaseId} TO ${roleId};`,
        `REVOKE ALL ON SCHEMA ${schemaId} FROM ${roleId};`,
        `GRANT USAGE ON SCHEMA ${schemaId} TO ${roleId};`,
        `GRANT SELECT ON ALL TABLES IN SCHEMA ${schemaId} TO ${roleId};`,
        `GRANT SELECT ON ALL SEQUENCES IN SCHEMA ${schemaId} TO ${roleId};`,
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaId} GRANT SELECT ON TABLES TO ${roleId};`,
        `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA ${schemaId} FROM ${roleId};`,
    ] as const;

    return { role, database, schema, statements };
}

/** Read-only verification: attribute and grant evidence for the role. */
export function buildAssistantQueryRoleVerificationSql(
    input: Pick<AssistantQueryRolePlanInput, 'role'>,
): string {
    const role = assertAssistantQueryRoleIdentifier(input.role, 'role');
    return `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin,
       rolreplication, rolbypassrls, rolconfig
FROM pg_roles WHERE rolname = ${quoteLiteral(role)};`;
}
