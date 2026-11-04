import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AssistantUserContext, ToolEvidence } from '../../assistant-types';
import {
    AssistantBrokerExecutor,
    type AssistantBrokerToolAudit,
} from '../broker-executor';
import type { AssistantBrokerToolRequest } from '../broker-protocol';
import { AssistantWorkerProtocolError } from '../protocol';

const authority: AssistantBrokerToolRequest['authority'] = {
    schemaVersion: 1,
    publicConversationId: 'conversation-one',
    tenantId: 'tenant-one',
    userId: 'user-one',
    channel: 'web',
    accessScopeHash: 'a'.repeat(64),
    workContextKey: 'production:hash',
    pathname: '/production/output-report',
    profile: 'production',
};

const request: AssistantBrokerToolRequest = {
    protocolVersion: 1,
    authority,
    executionKey: '1:2:call-one',
    taskId: '2',
    callId: 'call-one',
    toolName: 'get_daily_production_output',
    arguments: { date: '2026-11-03' },
};

const context: AssistantUserContext = {
    userId: 'user-one',
    roles: ['PRODUCTION'],
    allowedResources: ['/production/output-report'],
    tenantId: 'tenant-one',
    channel: 'web',
    locale: 'id',
};
const evidence: ToolEvidence = {
    summary: 'Synthetic output',
    facts: [],
    source: 'tenant-data',
    checkedAt: '2026-11-04T00:00:00.000Z',
    completeness: 'complete',
};

function fixtures(overrides?: {
    resources?: string[];
    execute?: () => Promise<ToolEvidence>;
    datasource?: string | undefined;
}) {
    const audits: AssistantBrokerToolAudit[] = [];
    const authorityDenials: AssistantBrokerToolAudit[] = [];
    const routed: string[] = [];
    let now = 100;
    const tool = {
        name: request.toolName,
        description: 'Synthetic read-only production output',
        requiredResources: ['/production/output-report'],
        sensitivity: 'normal' as const,
        inputSchema: z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }).strict(),
        execute: vi.fn(overrides?.execute ?? (async () => evidence)),
    };
    const executor = new AssistantBrokerExecutor([request.toolName], {
        getTool: (name) => (name === tool.name ? tool : undefined),
        withAuthority: async (expected, operation) => {
            expect(expected).toEqual(authority);
            return operation({
                assistantContext: {
                    ...context,
                    allowedResources:
                        overrides?.resources ?? context.allowedResources,
                },
            });
        },
        audit: async (entry) => {
            audits.push(entry);
        },
        auditAuthorityDenied: async (entry) => {
            authorityDenials.push(entry);
        },
        queryDatasourceForTenant: async () =>
            'datasource' in (overrides ?? {})
                ? overrides?.datasource
                : 'postgresql://query_role@db.invalid/tenant_one',
        runWithQueryDatasource: async (url, operation) => {
            routed.push(url);
            return operation();
        },
        now: () => now++,
    });
    return { executor, tool, audits, authorityDenials, routed };
}

describe('AssistantBrokerExecutor', () => {
    it('revalidates, reparses, and records STARTED then SUCCESS', async () => {
        const { executor, tool, audits, routed } = fixtures();
        await expect(executor.execute(request)).resolves.toEqual(evidence);
        expect(tool.execute).toHaveBeenCalledWith(request.arguments, context);
        expect(audits.map((entry) => entry.outcome)).toEqual([
            'STARTED',
            'SUCCESS',
        ]);
        expect(new Set(audits.map((entry) => entry.executionKey))).toEqual(
            new Set([request.executionKey]),
        );
        expect(audits[0]?.requestDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(routed).toEqual([
            'postgresql://query_role@db.invalid/tenant_one',
        ]);
    });

    it('fails closed when the tenant has no read-only query datasource', async () => {
        const missing = fixtures({ datasource: undefined });
        await expect(missing.executor.execute(request)).rejects.toMatchObject({
            code: 'UNAVAILABLE',
        });
        expect(missing.tool.execute).not.toHaveBeenCalled();
        expect(missing.audits.map((entry) => entry.outcome)).toEqual([
            'DENIED',
        ]);

        const invalid = fixtures({ datasource: undefined });
        const failing = new AssistantBrokerExecutor([request.toolName], {
            getTool: () => invalid.tool,
            withAuthority: async (_authority, operation) =>
                operation({ assistantContext: context }),
            audit: async (entry) => invalid.audits.push(entry),
            queryDatasourceForTenant: async () => {
                throw new Error('ASSISTANT_QUERY_DATASOURCE_INVALID');
            },
            runWithQueryDatasource: async () => {
                throw new Error('must not run');
            },
            now: () => 100,
        });
        await expect(failing.execute(request)).rejects.toMatchObject({
            code: 'UNAVAILABLE',
        });
        expect(invalid.tool.execute).not.toHaveBeenCalled();
    });

    it('denies revoked permission and invalid or extra arguments before execution', async () => {
        const revoked = fixtures({ resources: [] });
        await expect(revoked.executor.execute(request)).rejects.toMatchObject({
            code: 'PERMISSION_DENIED',
        });
        expect(revoked.tool.execute).not.toHaveBeenCalled();
        expect(revoked.audits.map((entry) => entry.outcome)).toEqual([
            'DENIED',
        ]);

        const malformed = fixtures();
        await expect(
            malformed.executor.execute({
                ...request,
                arguments: { ...request.arguments, sql: 'SELECT 1' },
            }),
        ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
        expect(malformed.tool.execute).not.toHaveBeenCalled();
        expect(malformed.audits.map((entry) => entry.outcome)).toEqual([
            'DENIED',
        ]);
    });

    it('keeps authority denials separate when stale authority cannot safely use normal audit', async () => {
        const fixture = fixtures();
        const denied = new AssistantBrokerExecutor([request.toolName], {
            getTool: () => fixture.tool,
            withAuthority: async () => {
                throw new AssistantWorkerProtocolError(
                    'CONTEXT_MISMATCH',
                    'changed scope',
                    403,
                );
            },
            audit: async (entry) => fixture.audits.push(entry),
            auditAuthorityDenied: async (entry) =>
                fixture.authorityDenials.push(entry),
            queryDatasourceForTenant: async () =>
                'postgresql://query_role@db.invalid/tenant_one',
            runWithQueryDatasource: async (_url, operation) => operation(),
            now: () => 100,
        });
        await expect(denied.execute(request)).rejects.toMatchObject({
            code: 'CONTEXT_MISMATCH',
        });
        expect(fixture.tool.execute).not.toHaveBeenCalled();
        expect(fixture.authorityDenials).toHaveLength(1);
        expect(fixture.authorityDenials[0]?.outcome).toBe('DENIED');
    });

    it('rejects unallowlisted tools and records terminal errors', async () => {
        const blocked = fixtures();
        await expect(
            blocked.executor.execute({ ...request, toolName: 'unknown_tool' }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });

        const failed = fixtures({
            execute: async () => {
                throw new Error('sensitive database details');
            },
        });
        await expect(failed.executor.execute(request)).rejects.toMatchObject({
            code: 'INTERNAL',
            message: 'Assistant broker query failed.',
        });
        expect(failed.audits.map((entry) => entry.outcome)).toEqual([
            'STARTED',
            'ERROR',
        ]);
    });
});
