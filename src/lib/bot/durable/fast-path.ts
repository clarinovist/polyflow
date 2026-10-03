import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { JsonValue } from '@earendil-works/chord';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import {
    AssistantEntry,
    defineExtension,
    defineTask,
    UserEntry,
    type Conversation,
    type Harness,
    type Submission,
} from '@earendil-works/pi-durable';
import { enforceGuardrails } from '../guardrails';
import { checkPromptInjection } from '../injection-defense';
import { detectGreeting } from '../greeting';
import { collectReproduction } from '../bug-triage';
import {
    buildTroubleshootingResponse,
    isUiIssueReport,
} from '../troubleshooting';
import { searchHelpArticles } from '../help-articles';
import { getAssistantProfilePresentation } from '../assistant-profiles';
import type { AssistantAuthority } from './protocol';
import type { AssistantResponse } from '../assistant-types';
import { PresentationEntry } from './documents';

/** Deterministic policy paths still enter the same durable submission. */
export async function evaluateDurableFastPath(input: {
    question: string;
    requesterName?: string;
    authority: AssistantAuthority;
}): Promise<AssistantResponse | undefined> {
    const guard = enforceGuardrails(input.question);
    if (!guard.allowed) {
        return {
            answer: guard.reason || 'Maaf, permintaan tidak bisa diproses.',
            citations: ['policy:read-only', 'policy:topic-lock'],
            safety: { allowed: false, blockedReason: guard.reason },
        };
    }
    const injection = checkPromptInjection(input.question);
    if (!injection.safe) {
        return {
            answer: 'Maaf, pesan Anda tidak dapat diproses karena mengandung elemen yang tidak diizinkan. Silakan sampaikan pertanyaan Anda dengan cara yang biasa.',
            citations: ['policy:security'],
            safety: {
                allowed: false,
                blockedReason: 'Prompt injection attempt blocked',
            },
        };
    }
    const greeting = detectGreeting(
        input.question,
        input.requesterName,
        getAssistantProfilePresentation(input.authority.profile),
    );
    if (greeting.isGreeting && greeting.reply) {
        return {
            answer: greeting.reply,
            citations: ['policy:greeting'],
            suggestions: greeting.suggestions,
            confidence: 1,
            safety: { allowed: true },
        };
    }
    const reproduction = collectReproduction(input.question, []);
    if (
        isUiIssueReport(input.question) ||
        reproduction.continuation ||
        Object.keys(reproduction.details).length >= 2
    ) {
        const articles = await searchHelpArticles(
            input.question,
            undefined,
            4,
        ).catch(() => []);
        return buildTroubleshootingResponse(
            input.question,
            articles,
            reproduction.details,
        );
    }
    return undefined;
}

type FastPathInput = {
    submissionId: number;
    requestId: string;
    response: JsonValue;
};
type FastPathState = { phase: 'commit' };

export const FastPathTask = defineTask<
    FastPathInput,
    FastPathState,
    { entryId: number }
>({
    name: 'polyflow.fast-path',
    version: 1,
    initial: () => ({ phase: 'commit' }),
    phases: {
        commit: async (task, runtime, context) => {
            const response = task.input
                .response as unknown as AssistantResponse;
            await runtime.commit(async (tx) => {
                const message: AssistantMessage = {
                    role: 'assistant',
                    content: [{ type: 'text', text: response.answer }],
                    api: 'polyflow-deterministic',
                    provider: 'polyflow',
                    model: 'fast-path',
                    usage: {
                        input: 0,
                        output: 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                        totalTokens: 0,
                        cost: {
                            input: 0,
                            output: 0,
                            cacheRead: 0,
                            cacheWrite: 0,
                            total: 0,
                        },
                    },
                    stopReason: 'stop',
                    timestamp: Date.now(),
                };
                const answer = await tx.appendEntry(
                    AssistantEntry,
                    runtime.conversationId,
                    { model: [message] },
                );
                await tx.appendEntry(
                    PresentationEntry,
                    runtime.conversationId,
                    {
                        data: {
                            requestId: task.input.requestId,
                            response: JSON.parse(JSON.stringify(response)),
                        },
                    },
                );
                tx.settleSubmission(task.input.submissionId as never, {
                    status: 'done',
                    answer: answer.id,
                });
                return {
                    status: 'terminal',
                    outcome: {
                        status: 'completed',
                        result: { entryId: Number(answer.id) },
                    },
                };
            }, context);
        },
    },
    abort: async (task, runtime, context) => {
        await runtime.commit((tx) => {
            tx.settleSubmission(task.input.submissionId as never, {
                status: 'unanswered',
                reason: 'aborted',
            });
            return {
                status: 'terminal',
                outcome: { status: 'aborted', reason: 'aborted' },
            };
        }, context);
    },
});

export const PolyflowFastPath = defineExtension({
    name: 'polyflow-fast-path',
    tasks: [FastPathTask],
});

export async function submitDurableFastPath(input: {
    harness: Harness;
    conversation: Conversation;
    requestId: string;
    question: string;
    response: AssistantResponse;
}): Promise<Submission> {
    const existingId = await input.conversation.commit(async (tx) => {
        const existing = await tx.submissionByRequest(
            input.conversation.id,
            input.requestId,
        );
        return existing?.id;
    }, BACKGROUND_CONTEXT);
    if (existingId) {
        const existing = await input.harness.submission(
            existingId,
            BACKGROUND_CONTEXT,
        );
        if (!existing) throw new Error('FAST_PATH_SUBMISSION_NOT_FOUND');
        return existing;
    }
    const submissionId = await input.conversation.commit(async (tx) => {
        // Recheck on the serialized commit line so concurrent retries cannot
        // create two submissions even if both missed the first read.
        const existing = await tx.submissionByRequest(
            input.conversation.id,
            input.requestId,
        );
        if (existing) return existing.id;
        const user = await tx.appendEntry(UserEntry, input.conversation.id, {
            model: [
                {
                    role: 'user',
                    content: input.question,
                    timestamp: Date.now(),
                },
            ],
        });
        const submission = await tx.createSubmission({
            type: 'input',
            conversationId: input.conversation.id,
            requestId: input.requestId,
            status: 'placed',
            entry: user.id,
        });
        await tx.createTask(
            FastPathTask,
            {
                submissionId: Number(submission.id),
                requestId: input.requestId,
                response: JSON.parse(JSON.stringify(input.response)),
            },
            { ownership: { kind: 'conversation' } },
        );
        return submission.id;
    }, BACKGROUND_CONTEXT);
    const submission = await input.harness.submission(
        submissionId,
        BACKGROUND_CONTEXT,
    );
    if (!submission) throw new Error('FAST_PATH_SUBMISSION_NOT_FOUND');
    return submission;
}
