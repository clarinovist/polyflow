import type { AssistantToolDefinition, ToolEvidence } from '../assistant-types';
import { checkToolAuthorization } from '../tool-authorization';
import { getToolByName } from '../tool-registry';
import { withBoundAuthority } from './authority';
import {
    createTenantQueryDatasourceResolver,
    runWithQueryDatasource,
    type TenantQueryDatasourceResolver,
} from './query-datasource';
import {
    assistantBrokerRequestDigest,
    type AssistantBrokerToolRequest,
} from './broker-protocol';
import { AssistantWorkerProtocolError } from './protocol';
import {
    getProposalToolByName,
    type AssistantProposalToolDefinition,
} from './proposal-tools';
import {
    upsertDurableToolAudit,
    upsertDurableToolAuthorityDenial,
} from './projection';

const DEFAULT_ASSISTANT_BROKER_TOOL_ALLOWLIST = [
    'get_daily_production_output',
] as const;

export type AssistantBrokerToolAudit = {
    authority: AssistantBrokerToolRequest['authority'];
    executionKey: string;
    taskId: string;
    callId: string;
    toolName: string;
    permissionResource: string;
    requestDigest: string;
    evidence?: ToolEvidence;
    allowed: boolean;
    outcome: 'STARTED' | 'SUCCESS' | 'ERROR' | 'DENIED';
    durationMs: number;
};

export type AssistantBrokerExecutorDependencies = {
    getTool(name: string): AssistantToolDefinition | undefined;
    /** Proposal tools record a PENDING proposal on the writer path; they never write business data. */
    getProposalTool?(name: string): AssistantProposalToolDefinition | undefined;
    withAuthority<T>(
        authority: AssistantBrokerToolRequest['authority'],
        operation: (input: {
            assistantContext: Parameters<typeof checkToolAuthorization>[1];
        }) => Promise<T>,
    ): Promise<T>;
    audit(
        input: AssistantBrokerToolAudit,
    ): Promise<void | 'CLAIMED' | 'RECORDED' | 'REPLAY'>;
    auditAuthorityDenied?(
        input: AssistantBrokerToolAudit,
    ): Promise<void | 'CLAIMED' | 'RECORDED' | 'REPLAY' | 'SKIPPED'>;
    queryDatasourceForTenant: TenantQueryDatasourceResolver;
    runWithQueryDatasource<T>(
        datasourceUrl: string,
        operation: () => Promise<T>,
    ): Promise<T>;
    now(): number;
};

const defaultDependencies: AssistantBrokerExecutorDependencies = {
    getTool: getToolByName,
    getProposalTool: getProposalToolByName,
    withAuthority: (authority, operation) =>
        withBoundAuthority(authority, ({ assistantContext }) =>
            operation({ assistantContext }),
        ),
    audit: upsertDurableToolAudit,
    auditAuthorityDenied: upsertDurableToolAuthorityDenial,
    queryDatasourceForTenant: createTenantQueryDatasourceResolver(),
    runWithQueryDatasource,
    now: () => Date.now(),
};

export class AssistantBrokerExecutor {
    private readonly allowlist: ReadonlySet<string>;

    constructor(
        allowlistedTools: readonly string[] = DEFAULT_ASSISTANT_BROKER_TOOL_ALLOWLIST,
        private readonly dependencies: AssistantBrokerExecutorDependencies = defaultDependencies,
    ) {
        this.allowlist = new Set(allowlistedTools);
    }

    /**
     * Proposal path: claim the execution key, then record the proposal with the
     * broker's own (writer) connection. Deliberately NOT routed through the
     * read-only query datasource, and never falls back to anything else.
     */
    private async runProposal(input: {
        proposalTool: AssistantProposalToolDefinition;
        args: unknown;
        assistantContext: Parameters<typeof checkToolAuthorization>[1];
        request: AssistantBrokerToolRequest;
        audit: (
            outcome: AssistantBrokerToolAudit['outcome'],
            allowed: boolean,
            evidence?: ToolEvidence,
        ) => Promise<void | 'CLAIMED' | 'RECORDED' | 'REPLAY'>;
    }): Promise<ToolEvidence> {
        const claim = await input.audit('STARTED', true);
        if (claim === 'REPLAY') {
            throw new AssistantWorkerProtocolError(
                'BUSY',
                'Assistant broker execution key is already claimed.',
                409,
                true,
            );
        }
        try {
            const evidence = await input.proposalTool.execute(input.args, {
                context: input.assistantContext,
                authority: input.request.authority,
            });
            await input.audit('SUCCESS', true, evidence);
            return evidence;
        } catch {
            await input.audit('ERROR', true);
            throw new AssistantWorkerProtocolError(
                'INTERNAL',
                'Assistant broker proposal failed.',
                500,
            );
        }
    }

    async execute(request: AssistantBrokerToolRequest): Promise<ToolEvidence> {
        const startedAt = this.dependencies.now();
        const requestDigest = assistantBrokerRequestDigest(request);
        const proposalTool = this.dependencies.getProposalTool?.(
            request.toolName,
        );
        const readOnlyTool = proposalTool
            ? undefined
            : this.dependencies.getTool(request.toolName);
        const tool = proposalTool ?? readOnlyTool;
        if (!tool || !this.allowlist.has(request.toolName)) {
            throw new AssistantWorkerProtocolError(
                'NOT_FOUND',
                'Assistant broker tool is not registered.',
                404,
            );
        }
        const audit = (
            outcome: AssistantBrokerToolAudit['outcome'],
            allowed: boolean,
            evidence?: ToolEvidence,
        ) =>
            this.dependencies.audit({
                authority: request.authority,
                executionKey: request.executionKey,
                taskId: request.taskId,
                callId: request.callId,
                toolName: tool.name,
                permissionResource: tool.requiredResources.join(','),
                requestDigest,
                evidence,
                allowed,
                outcome,
                durationMs: Math.max(0, this.dependencies.now() - startedAt),
            });

        try {
            return await this.dependencies.withAuthority(
                request.authority,
                async ({ assistantContext }) => {
                    const authorization = checkToolAuthorization(
                        tool,
                        assistantContext,
                    );
                    if (!authorization.allowed) {
                        await audit('DENIED', false);
                        throw new AssistantWorkerProtocolError(
                            'PERMISSION_DENIED',
                            authorization.reason ?? 'Permission denied.',
                            403,
                        );
                    }
                    const parsed = tool.inputSchema.safeParse(
                        request.arguments,
                    );
                    if (!parsed.success) {
                        await audit('DENIED', false);
                        throw new AssistantWorkerProtocolError(
                            'INVALID_REQUEST',
                            'Assistant broker tool arguments are invalid.',
                            400,
                        );
                    }
                    if (proposalTool) {
                        return this.runProposal({
                            proposalTool,
                            args: parsed.data,
                            assistantContext,
                            request,
                            audit,
                        });
                    }
                    if (!readOnlyTool) {
                        throw new AssistantWorkerProtocolError(
                            'NOT_FOUND',
                            'Assistant broker tool is not registered.',
                            404,
                        );
                    }
                    let queryDatasource: string | undefined;
                    try {
                        queryDatasource =
                            await this.dependencies.queryDatasourceForTenant(
                                request.authority.tenantId,
                            );
                    } catch {
                        await audit('DENIED', false);
                        throw new AssistantWorkerProtocolError(
                            'UNAVAILABLE',
                            'Assistant query datasource is not configured.',
                            503,
                        );
                    }
                    if (!queryDatasource) {
                        await audit('DENIED', false);
                        throw new AssistantWorkerProtocolError(
                            'UNAVAILABLE',
                            'Assistant query datasource is not configured.',
                            503,
                        );
                    }
                    const claim = await audit('STARTED', true);
                    if (claim === 'REPLAY') {
                        throw new AssistantWorkerProtocolError(
                            'BUSY',
                            'Assistant broker execution key is already claimed.',
                            409,
                            true,
                        );
                    }
                    try {
                        const evidence =
                            await this.dependencies.runWithQueryDatasource(
                                queryDatasource,
                                () =>
                                    readOnlyTool.execute(
                                        parsed.data,
                                        assistantContext,
                                    ),
                            );
                        await audit('SUCCESS', true, evidence);
                        return evidence;
                    } catch {
                        await audit('ERROR', true);
                        throw new AssistantWorkerProtocolError(
                            'INTERNAL',
                            'Assistant broker query failed.',
                            500,
                        );
                    }
                },
            );
        } catch (error) {
            if (
                error instanceof AssistantWorkerProtocolError &&
                (error.code === 'CONTEXT_MISMATCH' ||
                    error.code === 'PERMISSION_DENIED')
            ) {
                await this.dependencies.auditAuthorityDenied?.({
                    authority: request.authority,
                    executionKey: request.executionKey,
                    taskId: request.taskId,
                    callId: request.callId,
                    toolName: tool.name,
                    permissionResource: tool.requiredResources.join(','),
                    requestDigest,
                    allowed: false,
                    outcome: 'DENIED',
                    durationMs: Math.max(
                        0,
                        this.dependencies.now() - startedAt,
                    ),
                });
            }
            throw error;
        }
    }
}
