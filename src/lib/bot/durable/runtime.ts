import { createHash } from 'node:crypto';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
    AssistantEntry,
    watchEvents,
    type AgentEvent,
} from '@earendil-works/pi-durable';
import { getMainPrisma } from '@/lib/core/prisma';
import { getToolLabel } from '../tool-labels';
import type { AssistantStreamEvent } from '../assistant-types';
import {
    AssistantWorkerProtocolError,
    type AssistantAuthority,
    type AssistantSubmissionEnvelope,
    type DurableSubmissionSnapshot,
} from './protocol';
import { verifyDurableAuthority } from './authority';
import { TenantHarnessManager } from './harness-manager';
import {
    assertDurableBinding,
    conversationAdmissionLockKey,
    DurableAdmissionLocks,
    requestAdmissionLockKey,
    reserveDurableAdmission,
} from './admission';
import { projectDurableSubmission } from './projection';
import { IntentDoc } from './documents';
import {
    evaluateAssistantPreflight,
    isAssistantJevEnabled,
} from '../assistant-jev';
import { detectAssistantIntent } from '../assistant-intent';
import { getAvailableAssistantTools } from '../assistant-tool-access';
import { evaluateDurableFastPath, submitDurableFastPath } from './fast-path';

export class DurableAssistantRuntime {
    private readonly admissionLocks = new DurableAdmissionLocks();

    constructor(private readonly manager: TenantHarnessManager) {}

    async submit(
        input: AssistantSubmissionEnvelope,
    ): Promise<DurableSubmissionSnapshot> {
        return this.admissionLocks.run(requestAdmissionLockKey(input), () =>
            this.submitLocked(input),
        );
    }

    private async submitLocked(
        input: AssistantSubmissionEnvelope,
    ): Promise<DurableSubmissionSnapshot> {
        const questionHash = createHash('sha256')
            .update(input.question)
            .digest('hex');
        const existing =
            await getMainPrisma().assistantDurableSubmission.findUnique({
                where: {
                    tenantId_userId_channel_requestId: {
                        tenantId: input.tenantId,
                        userId: input.userId,
                        channel: input.channel,
                        requestId: input.requestId,
                    },
                },
            });
        const effectiveInput = {
            ...input,
            publicConversationId:
                input.publicConversationId ?? existing?.publicConversationId,
        };
        const verified = await verifyDurableAuthority(effectiveInput);
        if (
            existing &&
            (existing.publicConversationId !==
                verified.authority.publicConversationId ||
                existing.questionHash !== questionHash)
        ) {
            throw new AssistantWorkerProtocolError(
                'CONTEXT_MISMATCH',
                'requestId is already bound to a different submission.',
                409,
            );
        }
        if (existing?.durableSubmissionId && existing.durableConversationId) {
            const existingBinding =
                await getMainPrisma().assistantDurableBinding.findUnique({
                    where: {
                        publicConversationId:
                            verified.authority.publicConversationId,
                    },
                });
            if (!existingBinding) {
                throw new AssistantWorkerProtocolError(
                    'INTERNAL',
                    'Durable admission registry is inconsistent.',
                    500,
                );
            }
            assertDurableBinding(existingBinding, {
                authority: verified.authority,
                durableConversationId: existing.durableConversationId,
            });
            const observed =
                await getMainPrisma().assistantDurableSubmission.update({
                    where: { id: existing.id },
                    data: { attempts: { increment: 1 } },
                });
            return this.resumeKnownSubmission(
                input,
                verified.authority,
                observed,
            );
        }
        if (existing) {
            const interruptedBinding =
                await getMainPrisma().assistantDurableBinding.findUnique({
                    where: {
                        publicConversationId:
                            verified.authority.publicConversationId,
                    },
                });
            if (!interruptedBinding) {
                throw new AssistantWorkerProtocolError(
                    'INTERNAL',
                    'Durable admission registry is inconsistent.',
                    500,
                );
            }
        }

        // Serialize only creation/assertion of the SQLite conversation and its
        // PG parent+reservation. Release this lock before model or tool work.
        const prepared = await this.admissionLocks.run(
            conversationAdmissionLockKey(
                verified.authority.publicConversationId,
            ),
            async () => {
                // Re-read after waiting for the per-conversation lock. Another
                // request may have created the binding while this one waited.
                const binding =
                    await getMainPrisma().assistantDurableBinding.findUnique({
                        where: {
                            publicConversationId:
                                verified.authority.publicConversationId,
                        },
                    });
                const lease = await this.manager.acquire(
                    verified.authority,
                    binding ? Number(binding.durableConversationId) : undefined,
                );
                try {
                    const admission = await reserveDurableAdmission({
                        database: getMainPrisma(),
                        envelope: input,
                        authority: verified.authority,
                        questionHash,
                        durableConversationId: String(lease.conversation.id),
                    });
                    return { lease, reserved: admission.reservation };
                } catch (error) {
                    lease.release();
                    throw error;
                }
            },
        );
        const { lease, reserved } = prepared;
        try {
            if (
                reserved.durableSubmissionId &&
                reserved.durableConversationId
            ) {
                lease.release();
                return this.resumeKnownSubmission(
                    input,
                    verified.authority,
                    reserved,
                );
            }

            // Reconcile: a crash may have admitted to SQLite after the
            // reservation but before the PG update. The serialized commit
            // line is the single dedupe truth.
            const reconciled = await lease.conversation.commit(async (tx) => {
                const found = await tx.submissionByRequest(
                    lease.conversation.id,
                    input.requestId,
                );
                return found
                    ? {
                          durableSubmissionId: String(found.id),
                          durableConversationId: String(lease.conversation.id),
                      }
                    : null;
            }, BACKGROUND_CONTEXT);
            if (reconciled) {
                await this.fillReservation(input, verified.authority, {
                    ...reconciled,
                    status: 'queued',
                });
                const submission = await lease.harness.submission(
                    Number(reconciled.durableSubmissionId) as never,
                    BACKGROUND_CONTEXT,
                );
                if (submission) {
                    const state = await submission.status(BACKGROUND_CONTEXT);
                    const snapshot = await this.snapshotLiveSubmission(
                        input,
                        verified.authority,
                        { createdAt: reserved.createdAt },
                        lease.harness,
                        Number(lease.conversation.id),
                        state,
                    );
                    if (
                        snapshot.status === 'done' ||
                        snapshot.status === 'unanswered' ||
                        snapshot.status === 'aborted'
                    ) {
                        await this.updateRegistryStatus(
                            input,
                            verified.authority,
                            snapshot.status,
                        );
                    }
                    return snapshot;
                }
            }

            const fastPath = await evaluateDurableFastPath({
                question: input.question,
                authority: verified.authority,
            });
            let offeredTools = getAvailableAssistantTools(
                verified.assistantContext,
                true,
            );
            if (!fastPath) {
                const deterministicIntent = detectAssistantIntent(
                    input.question,
                );
                const preflight = isAssistantJevEnabled()
                    ? await evaluateAssistantPreflight({
                          question: input.question,
                          deterministicIntent,
                          availableToolNames: offeredTools.map(
                              (tool) => tool.name,
                          ),
                      })
                    : ({ status: 'unavailable' } as const);
                if (
                    preflight.status === 'completed' &&
                    preflight.data.routeConfidence >= 0.7
                ) {
                    if (preflight.data.route === 'data_tools') {
                        offeredTools = offeredTools.filter(
                            (tool) => tool.name !== 'search_help_articles',
                        );
                    } else if (preflight.data.route === 'knowledge_base') {
                        offeredTools = offeredTools.filter(
                            (tool) => tool.name === 'search_help_articles',
                        );
                    } else if (
                        preflight.data.route === 'clarify' &&
                        preflight.data.needsClarification >= 0.7
                    ) {
                        offeredTools = [];
                    }
                }
                const allowedNames = new Set(
                    offeredTools.map((tool) => tool.name),
                );
                await lease.conversation.configure(
                    {
                        tools: (lease.tools.tools ?? []).filter((tool) =>
                            allowedNames.has(tool.name),
                        ),
                    },
                    BACKGROUND_CONTEXT,
                );
                await lease.conversation.commit(async (tx) => {
                    const intent = await tx.doc(
                        IntentDoc,
                        lease.conversation.id,
                    );
                    Object.assign(
                        intent,
                        preflight.status === 'completed'
                            ? {
                                  status: 'completed',
                                  deterministicIntent,
                                  route: preflight.data.route,
                                  routeConfidence:
                                      preflight.data.routeConfidence,
                                  needsClarification:
                                      preflight.data.needsClarification,
                              }
                            : {
                                  status: 'unavailable',
                                  deterministicIntent,
                              },
                    );
                }, BACKGROUND_CONTEXT);
            }
            const submission = fastPath
                ? await submitDurableFastPath({
                      harness: lease.harness,
                      conversation: lease.conversation,
                      question: input.question,
                      requestId: input.requestId,
                      response: fastPath,
                  })
                : await lease.conversation.submit(
                      {
                          type: 'input',
                          content: input.question,
                          requestId: input.requestId,
                          whenBusy: 'followUp',
                      },
                      BACKGROUND_CONTEXT,
                  );
            await this.fillReservation(input, verified.authority, {
                durableSubmissionId: String(submission.id),
                durableConversationId: String(lease.conversation.id),
                status: 'queued',
            });
            return {
                requestId: input.requestId,
                publicConversationId: verified.authority.publicConversationId,
                status: 'queued',
                accepted: true,
            };
        } finally {
            lease.release();
        }
    }

    private async updateRegistryStatus(
        input: AssistantSubmissionEnvelope,
        authority: { publicConversationId: string },
        status: 'done' | 'unanswered' | 'aborted',
    ): Promise<void> {
        await getMainPrisma().assistantDurableSubmission.updateMany({
            where: {
                tenantId: input.tenantId,
                userId: input.userId,
                channel: input.channel,
                requestId: input.requestId,
                publicConversationId: authority.publicConversationId,
            },
            data: { status },
        });
    }

    private async fillReservation(
        input: AssistantSubmissionEnvelope,
        authority: { publicConversationId: string },
        ids: {
            durableSubmissionId: string;
            durableConversationId: string;
            status: string;
        },
    ) {
        await getMainPrisma().assistantDurableSubmission.updateMany({
            where: {
                tenantId: input.tenantId,
                userId: input.userId,
                channel: input.channel,
                requestId: input.requestId,
                publicConversationId: authority.publicConversationId,
            },
            data: {
                durableSubmissionId: ids.durableSubmissionId,
                durableConversationId: ids.durableConversationId,
                status: ids.status,
            },
        });
    }

    /** Resume path for a fully-registered submission: verify binding, then
     * observe the single durable submission — never admit a second one. */
    private async resumeKnownSubmission(
        input: AssistantSubmissionEnvelope,
        authority: AssistantAuthority,
        known: {
            durableSubmissionId: string | null;
            durableConversationId: string | null;
            questionHash: string;
            publicConversationId: string;
            createdAt: Date;
        },
    ): Promise<DurableSubmissionSnapshot> {
        if (
            known.publicConversationId !== authority.publicConversationId ||
            known.questionHash !==
                createHash('sha256').update(input.question).digest('hex')
        ) {
            throw new AssistantWorkerProtocolError(
                'CONTEXT_MISMATCH',
                'requestId is already bound to a different submission.',
                409,
            );
        }
        const binding =
            await getMainPrisma().assistantDurableBinding.findUnique({
                where: { publicConversationId: authority.publicConversationId },
            });
        if (!binding) {
            throw new AssistantWorkerProtocolError(
                'INTERNAL',
                'Durable admission registry is inconsistent.',
                500,
            );
        }
        assertDurableBinding(binding, {
            authority,
            durableConversationId: String(
                known.durableConversationId ?? binding.durableConversationId,
            ),
        });
        if (
            known.durableConversationId !== null &&
            binding.durableConversationId !== known.durableConversationId
        ) {
            throw new AssistantWorkerProtocolError(
                'CONTEXT_MISMATCH',
                'requestId is already bound to a different submission.',
                409,
            );
        }
        const boundConversationId = Number(binding.durableConversationId);
        const lease = await this.manager.acquire(
            authority as never,
            boundConversationId,
        );
        try {
            const submission = await lease.harness.submission(
                Number(known.durableSubmissionId) as never,
                BACKGROUND_CONTEXT,
            );
            if (!submission) {
                // Registry points at a durable submission the SQLite store
                // does not have (e.g. volume replaced). Fail closed with a
                // redacted NOT_FOUND so status/wait/abort never silently
                // admit a second run for the same requestId.
                throw new AssistantWorkerProtocolError(
                    'NOT_FOUND',
                    'Durable submission was not found.',
                    404,
                );
            }
            const state = await submission.status(BACKGROUND_CONTEXT);
            const snapshot = await this.snapshotLiveSubmission(
                input,
                authority,
                known,
                lease.harness,
                Number(lease.conversation.id),
                state,
            );
            if (
                snapshot.status === 'done' ||
                snapshot.status === 'unanswered' ||
                snapshot.status === 'aborted'
            ) {
                await this.updateRegistryStatus(
                    input,
                    authority,
                    snapshot.status,
                );
            }
            return snapshot;
        } finally {
            lease.release();
        }
    }

    private async snapshotLiveSubmission(
        input: AssistantSubmissionEnvelope,
        authority: Parameters<typeof projectDurableSubmission>[0]['authority'],
        known: { createdAt: Date },
        harness: Parameters<typeof projectDurableSubmission>[0]['harness'],
        durableConversationId: number,
        state: unknown,
    ): Promise<DurableSubmissionSnapshot> {
        const typed = state as {
            status: string;
            type?: string;
            entry?: number;
            answer?: number;
            reason?: string;
        };
        if (typed.status === 'done' && typed.type === 'input') {
            const response = await projectDurableSubmission({
                harness,
                durableConversationId,
                authority,
                requestId: input.requestId,
                question: input.question,
                userEntryId: Number(typed.entry),
                answerEntryId: Number(typed.answer),
                startedAt: known.createdAt.getTime(),
            });
            return {
                requestId: input.requestId,
                publicConversationId: authority.publicConversationId,
                status: 'done',
                accepted: true,
                response,
            };
        }
        return {
            requestId: input.requestId,
            publicConversationId: authority.publicConversationId,
            status:
                typed.status === 'queued'
                    ? 'queued'
                    : typed.status === 'placed'
                      ? 'running'
                      : typed.reason === 'aborted'
                        ? 'aborted'
                        : 'unanswered',
            accepted: true,
        };
    }

    async status(
        input: AssistantSubmissionEnvelope,
    ): Promise<DurableSubmissionSnapshot> {
        const { record, authority, harness, release } =
            await this.openOwned(input);
        try {
            const submission = await harness.submission(
                Number(record.durableSubmissionId) as never,
                BACKGROUND_CONTEXT,
            );
            if (!submission) {
                throw new AssistantWorkerProtocolError(
                    'NOT_FOUND',
                    'Durable submission was not found.',
                    404,
                );
            }
            const status = await submission.status(BACKGROUND_CONTEXT);
            if (status.status === 'done' && status.type === 'input') {
                const projected = await projectDurableSubmission({
                    harness,
                    durableConversationId: Number(record.durableConversationId),
                    authority,
                    requestId: input.requestId,
                    question: input.question,
                    userEntryId: Number(status.entry),
                    answerEntryId: Number(status.answer),
                    startedAt: record.createdAt.getTime(),
                });
                await getMainPrisma().assistantDurableSubmission.update({
                    where: { id: record.id },
                    data: { status: 'done' },
                });
                return {
                    requestId: input.requestId,
                    publicConversationId: authority.publicConversationId,
                    status: 'done',
                    accepted: true,
                    response: projected,
                };
            }
            if (status.status === 'unanswered') {
                const aborted = status.reason === 'aborted';
                await getMainPrisma().assistantDurableSubmission.update({
                    where: { id: record.id },
                    data: { status: aborted ? 'aborted' : 'unanswered' },
                });
                return {
                    requestId: input.requestId,
                    publicConversationId: authority.publicConversationId,
                    status: aborted ? 'aborted' : 'unanswered',
                    accepted: true,
                    error: {
                        code: 'UNANSWERED',
                        message: aborted
                            ? 'Submission was cancelled.'
                            : 'Assistant could not complete this submission.',
                        retryable: false,
                    },
                };
            }
            return {
                requestId: input.requestId,
                publicConversationId: authority.publicConversationId,
                status: status.status === 'queued' ? 'queued' : 'running',
                accepted: true,
            };
        } finally {
            release();
        }
    }

    async wait(
        input: AssistantSubmissionEnvelope,
        onEvent?: (event: AssistantStreamEvent) => void,
    ): Promise<DurableSubmissionSnapshot> {
        const { record, harness, release } = await this.openOwned(input);
        try {
            const stream = onEvent
                ? await watchEvents(
                      harness,
                      Number(record.durableConversationId) as never,
                      BACKGROUND_CONTEXT,
                  )
                : undefined;
            const partial = stream?.snapshot.generation?.message;
            if (partial && onEvent) {
                const text = partial.content
                    .filter((item) => item.type === 'text')
                    .map((item) => item.text)
                    .join('');
                if (text) onEvent({ type: 'delta', text });
                for (const tool of stream!.snapshot.tools) {
                    onEvent({
                        type: 'tool',
                        name: tool.name,
                        label: getToolLabel(tool.name),
                    });
                }
            }
            stream?.start(async (events) => {
                for (const event of events) emitAgentEvent(event, onEvent!);
            });
            const submission = await harness.submission(
                Number(record.durableSubmissionId) as never,
                BACKGROUND_CONTEXT,
            );
            if (!submission) {
                await stream?.stop();
                throw new AssistantWorkerProtocolError(
                    'NOT_FOUND',
                    'Durable submission was not found.',
                    404,
                );
            }
            await submission.wait(BACKGROUND_CONTEXT);
            await stream?.stop();
            const settled = await submission.status(BACKGROUND_CONTEXT);
            if (settled.status === 'done' && settled.type === 'input') {
                const authority = await verifyDurableAuthority(input);
                const projected = await projectDurableSubmission({
                    harness,
                    durableConversationId: Number(record.durableConversationId),
                    authority: authority.authority,
                    requestId: input.requestId,
                    question: input.question,
                    userEntryId: Number(settled.entry),
                    answerEntryId: Number(settled.answer),
                    startedAt: record.createdAt.getTime(),
                });
                await getMainPrisma().assistantDurableSubmission.update({
                    where: { id: record.id },
                    data: { status: 'done' },
                });
                return {
                    requestId: input.requestId,
                    publicConversationId:
                        authority.authority.publicConversationId,
                    status: 'done',
                    accepted: true,
                    response: projected,
                };
            }
            const aborted =
                settled.status === 'unanswered' && settled.reason === 'aborted';
            await getMainPrisma().assistantDurableSubmission.update({
                where: { id: record.id },
                data: { status: aborted ? 'aborted' : 'unanswered' },
            });
            return {
                requestId: input.requestId,
                publicConversationId: record.publicConversationId,
                status: aborted ? 'aborted' : 'unanswered',
                accepted: true,
                error: {
                    code: 'UNANSWERED',
                    message: aborted
                        ? 'Submission was cancelled.'
                        : 'Assistant could not complete this submission.',
                    retryable: false,
                },
            };
        } finally {
            release();
        }
    }

    async abort(
        input: AssistantSubmissionEnvelope,
    ): Promise<DurableSubmissionSnapshot> {
        const { record, harness, release } = await this.openOwned(input);
        try {
            const submission = await harness.submission(
                Number(record.durableSubmissionId) as never,
                BACKGROUND_CONTEXT,
            );
            if (!submission) {
                throw new AssistantWorkerProtocolError(
                    'NOT_FOUND',
                    'Submission not found.',
                    404,
                );
            }
            const result = await submission.abort(BACKGROUND_CONTEXT);
            if (result === 'already_placed') {
                const conversation = await harness.conversation(
                    Number(record.durableConversationId) as never,
                    BACKGROUND_CONTEXT,
                );
                await conversation?.abort(BACKGROUND_CONTEXT);
            }
            return this.status(input);
        } finally {
            release();
        }
    }

    private async openOwned(input: AssistantSubmissionEnvelope) {
        const record =
            await getMainPrisma().assistantDurableSubmission.findUnique({
                where: {
                    tenantId_userId_channel_requestId: {
                        tenantId: input.tenantId,
                        userId: input.userId,
                        channel: input.channel,
                        requestId: input.requestId,
                    },
                },
            });
        if (
            !record ||
            record.questionHash !==
                createHash('sha256').update(input.question).digest('hex') ||
            (input.publicConversationId &&
                input.publicConversationId !== record.publicConversationId)
        ) {
            throw new AssistantWorkerProtocolError(
                'NOT_FOUND',
                'Submission not found.',
                404,
            );
        }
        // A `pending` reservation without durable IDs is an interrupted
        // admission, not an observable submission: route the retry back
        // through submit() so it reconciles via submissionByRequest instead
        // of observing a half-registered row here.
        if (!record.durableSubmissionId || !record.durableConversationId) {
            throw new AssistantWorkerProtocolError(
                'NOT_FOUND',
                'Submission not found.',
                404,
            );
        }
        const binding =
            await getMainPrisma().assistantDurableBinding.findUnique({
                where: { publicConversationId: record.publicConversationId },
            });
        if (!binding) {
            throw new AssistantWorkerProtocolError(
                'NOT_FOUND',
                'Conversation binding not found.',
                404,
            );
        }
        const verified = await verifyDurableAuthority({
            ...input,
            publicConversationId: record.publicConversationId,
            workContext: { pathname: binding.pathname },
        });
        assertDurableBinding(binding, {
            authority: verified.authority,
            durableConversationId: record.durableConversationId as string,
        });
        const lease = await this.manager.acquire(
            verified.authority,
            Number(record.durableConversationId),
        );
        return {
            record,
            authority: verified.authority,
            harness: lease.harness,
            release: lease.release,
        };
    }
}

function emitAgentEvent(
    event: AgentEvent,
    send: (event: AssistantStreamEvent) => void,
) {
    if (event.type === 'message_update') {
        for (const change of event.changes) {
            if (change.type === 'text_delta')
                send({ type: 'delta', text: change.delta });
        }
    } else if (event.type === 'tool_execution_start') {
        send({
            type: 'tool',
            name: event.toolName,
            label: getToolLabel(event.toolName),
        });
    } else if (event.type === 'message_end' && AssistantEntry.is(event.entry)) {
        // Final metadata is emitted by the web/worker finalization path.
    }
}
