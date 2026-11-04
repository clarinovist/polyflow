import { describe, expect, it } from 'vitest';
import {
    buildAssistantQueryRolePlan,
    buildAssistantQueryRoleVerificationSql,
} from '../assistant-query-role';

describe('assistant query role plan', () => {
    it('produces idempotent least-privilege statements without secrets', () => {
        const plan = buildAssistantQueryRolePlan({
            role: 'assistant_query',
            database: 'polyflow_tenant',
        });
        const sql = plan.statements.join('\n');

        expect(sql).toContain('IF NOT EXISTS (SELECT 1 FROM pg_roles');
        expect(sql).toContain(
            'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
        );
        expect(sql).toContain('default_transaction_read_only = on');
        expect(sql).toContain("statement_timeout = '10000ms'");
        expect(sql).toContain("lock_timeout = '2000ms'");
        expect(sql).toContain('GRANT SELECT ON ALL TABLES IN SCHEMA "public"');
        expect(sql).toContain('ALTER DEFAULT PRIVILEGES');
        expect(sql).toContain(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER',
        );
        expect(sql).not.toMatch(/password/i);
        expect(sql).not.toContain(process.env.ASSISTANT_QUERY_ADMIN_URL ?? 'x');
    });

    it('clamps timeouts and rejects unsafe identifiers', () => {
        const clamped = buildAssistantQueryRolePlan({
            role: 'assistant_query',
            database: 'tenant',
            statementTimeoutMs: 999_999,
            lockTimeoutMs: 1,
        });
        const sql = clamped.statements.join('\n');
        expect(sql).toContain("statement_timeout = '30000ms'");
        expect(sql).toContain("lock_timeout = '500ms'");

        expect(() =>
            buildAssistantQueryRolePlan({
                role: 'postgres',
                database: 'tenant',
            }),
        ).toThrow('ASSISTANT_QUERY_ROLE_MUST_BE_DEDICATED');
        expect(() =>
            buildAssistantQueryRolePlan({
                role: 'assistant_query; DROP TABLE x',
                database: 'tenant',
            }),
        ).toThrow('ASSISTANT_QUERY_ROLE_INVALID_ROLE');
        expect(() =>
            buildAssistantQueryRolePlan({
                role: 'assistant_query',
                database: 'tenant" --',
            }),
        ).toThrow('ASSISTANT_QUERY_ROLE_INVALID_DATABASE');
    });

    it('verifies role attributes instead of assuming them', () => {
        const sql = buildAssistantQueryRoleVerificationSql({
            role: 'assistant_query',
        });
        expect(sql).toContain('rolsuper');
        expect(sql).toContain('rolbypassrls');
        expect(sql).toContain("WHERE rolname = 'assistant_query'");
    });
});
