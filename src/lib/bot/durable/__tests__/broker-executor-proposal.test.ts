import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AssistantUserContext, ToolEvidence } from '../../assistant-types';
import {
    AssistantBrokerExecutor,
    type AssistantBrokerToolAudit,
} from '../broker-executor';
import type { AssistantBrokerToolRequest } from '../broker-protocol';
import type { AssistantProposalToolDefinition } from '../proposal-tools';

const authority: AssistantBrokerToolRequest['authority'] = {
    schemaVersion: 1,
    publicConversationId: 'conversation-one',
    tenantId: 'tenant-one',
    userId: 'user-one',
    channel: 'web',
    accessScopeHash: 'a'.repeat(64),
    workContextKey: 'general:hash',
    pathname: '/sales/invoices',
    profile: 'general',
};
const request: AssistantBrokerToolRequest = {
    protocolVersion: 1,
    authority,
    executionKey: '1:2:call-one',
    taskId: '2',
    callId: 'call-one',
    toolName: 'propose_synthetic',
    arguments: { invoiceId: 'inv1' },
};
const context: AssistantUserContext = {
    userId: 'user-one',
    roles: ['SALES'],
    allowedResources: ['/sales/collection'],
    tenantId: 'tenant-one',
    channel: 'web',
    locale: 'id',
};
const evidence: ToolEvidence = {
    summary: 'proposal pending',
    facts: [],
    source: 'tenant-data',
    checkedAt: '2026-11-05T00:00:00.000Z',
    completeness: 'complete',
};

function fixtures(opts?: {
    resources?: string[];
    claim?: 'CLAIMED' | 'REPLAY';
    execute?: () => Promise<ToolEvidence>;
}) {
    const audits: AssistantBrokerToolAudit[] = [];
    const queryDatasourceForTenant = vi.fn(async () => 'postgresql://ro');
    const runWithQueryDatasource = vi.fn(
        async (_url: string, op: () => Promise<unknown>) => op(),
    );
    const execute = vi.fn(opts?.execute ?? (async () => evidence));
    const proposalTool: AssistantProposalToolDefinition = {
        name: 'propose_synthetic',
        description: 'synthetic',
        requiredResources: ['/sales/collection'],
        sensitivity: 'normal',
        inputSchema: z.object({ invoiceId: z.string() }).strict(),
        execute,
    };
    const executor = new AssistantBrokerExecutor(['propose_synthetic'], {
        getTool: () => undefined,
        getProposalTool: (name) =>
            name === proposalTool.name ? proposalTool : undefined,
        withAuthority: async (_a, op) =>
            op({
                assistantContext: {
                    ...context,
                    allowedResources:
                        opts?.resources ?? context.allowedResources,
                },
            }),
        audit: async (entry) => {
            audits.push(entry);
            return entry.outcome === 'STARTED' ? opts?.claim : undefined;
        },
        queryDatasourceForTenant,
        runWithQueryDatasource: runWithQueryDatasource as never,
        now: () => 1,
    });
    return {
        executor,
        audits,
        execute,
        queryDatasourceForTenant,
        runWithQueryDatasource,
    };
}

describe('AssistantBrokerExecutor proposal tools', () => {
    it('runs on the writer path, never through the read-only datasource', async () => {
        const f = fixtures();
        await expect(f.executor.execute(request)).resolves.toEqual(evidence);
        expect(f.queryDatasourceForTenant).not.toHaveBeenCalled();
        expect(f.runWithQueryDatasource).not.toHaveBeenCalled();
        expect(f.execute).toHaveBeenCalledWith(
            { invoiceId: 'inv1' },
            { context, authority },
        );
        expect(f.audits.map((a) => a.outcome)).toEqual(['STARTED', 'SUCCESS']);
    });

    it('denies and audits when the user lacks the tool resource', async () => {
        const f = fixtures({ resources: ['/warehouse/inventory'] });
        await expect(f.executor.execute(request)).rejects.toMatchObject({
            code: 'PERMISSION_DENIED',
        });
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.audits.map((a) => a.outcome)).toEqual(['DENIED']);
    });

    it('rejects invalid arguments without executing', async () => {
        const f = fixtures();
        await expect(
            f.executor.execute({
                ...request,
                arguments: { invoiceId: 'inv1', status: 'PAID' },
            }),
        ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
        expect(f.execute).not.toHaveBeenCalled();
    });

    it('rejects a replayed execution key without executing twice', async () => {
        const f = fixtures({ claim: 'REPLAY' });
        await expect(f.executor.execute(request)).rejects.toMatchObject({
            code: 'BUSY',
        });
        expect(f.execute).not.toHaveBeenCalled();
    });

    it('audits ERROR and hides the cause when the proposal write fails', async () => {
        const f = fixtures({
            execute: async () => {
                throw new Error('db password leaked');
            },
        });
        await expect(f.executor.execute(request)).rejects.toMatchObject({
            code: 'INTERNAL',
            message: expect.not.stringContaining('password'),
        });
        expect(f.audits.map((a) => a.outcome)).toEqual(['STARTED', 'ERROR']);
    });

    it('is not reachable unless allowlisted', async () => {
        const f = fixtures();
        const denied = new AssistantBrokerExecutor([], {
            getTool: () => undefined,
            getProposalTool: () => ({}) as never,
            withAuthority: async () => {
                throw new Error('must not run');
            },
            audit: async () => undefined,
            queryDatasourceForTenant: async () => undefined,
            runWithQueryDatasource: async () => {
                throw new Error('must not run');
            },
            now: () => 1,
        });
        await expect(denied.execute(request)).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        expect(f.execute).not.toHaveBeenCalled();
    });
});
