import { describe, expect, it } from 'vitest';
import {
    ASSISTANT_CONTROL_WRITE_TABLES,
    buildAssistantControlRolePlan,
    buildAssistantControlRoleVerificationSql,
} from '../assistant-control-role';

describe('assistant control role plan', () => {
    it('grants reads broadly but writes only assistant tables', () => {
        const plan = buildAssistantControlRolePlan({
            role: 'assistant_control',
            database: 'tenant_one',
        });
        const sql = plan.statements.join('\n');

        expect(sql).toContain('NOSUPERUSER NOCREATEDB NOCREATEROLE');
        expect(sql).toContain('GRANT SELECT ON ALL TABLES IN SCHEMA "public"');
        expect(sql).toContain(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES',
        );
        for (const table of ASSISTANT_CONTROL_WRITE_TABLES) {
            expect(sql).toContain(`"${table}"`);
        }
        expect(sql).not.toContain('GRANT INSERT, UPDATE, DELETE ON TABLE "Product"');
        expect(sql).not.toContain('ALTER DEFAULT PRIVILEGES');
        expect(sql).toContain('REVOKE SELECT ON TABLE "ApiKey"');
        // Case-sensitive identifier must be quoted inside to_regclass too.
        expect(sql).toContain('public."ApiKey"');
        expect(sql).not.toMatch(/password/i);
    });

    it('rejects dedicated-role violations and unsafe identifiers', () => {
        expect(() =>
            buildAssistantControlRolePlan({
                role: 'polyflow',
                database: 'tenant_one',
            }),
        ).toThrow('ASSISTANT_CONTROL_ROLE_MUST_BE_DEDICATED');
        expect(() =>
            buildAssistantControlRolePlan({
                role: 'assistant_control; DROP TABLE x',
                database: 'tenant_one',
            }),
        ).toThrow('ASSISTANT_CONTROL_ROLE_INVALID_ROLE');
        expect(() =>
            buildAssistantControlRolePlan({
                role: 'assistant_control',
                database: 'tenant" --',
            }),
        ).toThrow('ASSISTANT_CONTROL_ROLE_INVALID_DATABASE');
    });

    it('verifies attributes from pg_roles, not local assumptions', () => {
        const sql = buildAssistantControlRoleVerificationSql({
            role: 'assistant_control',
        });
        expect(sql).toContain('rolsuper');
        expect(sql).toContain("WHERE rolname = 'assistant_control'");
    });
});
