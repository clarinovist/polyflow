import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
    AssistantEntry,
    createRegistry,
    defineDocFamily,
    defineExtension,
    defineTool,
    Harness,
    section,
    type Conversation,
    type Harness as HarnessInstance,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { Type, type Models } from '@earendil-works/pi-ai';
import type { JsonObject } from '@earendil-works/pi-durable';
import { searchHelpArticles } from '../help-articles';
import { ASSISTANT_PERSONA } from '../assistant-persona';
import type { AssistantResponse } from '../assistant-types';
import {
    AssistantWorkerProtocolError,
    type RestrictedTelegramEnvelope,
    type RestrictedTelegramSnapshot,
} from './protocol';

export const RESTRICTED_TELEGRAM_STORAGE_KEY = createHash('sha256')
    .update('polyflow:restricted-telegram-public:v1')
    .digest('hex');

type RequestBinding = JsonObject & {
    questionHash: string;
    conversationId: number;
};

const RequestBindingDoc = defineDocFamily<
    RequestBinding,
    { questionHash: string }
>({
    kind: 'polyflow.restricted-telegram-request',
    version: 1,
    family: true,
    scope: 'session',
    initial: (seed) => ({ questionHash: seed.questionHash, conversationId: 0 }),
});

const RestrictedTelegramExtension = defineExtension({
    name: 'polyflow-restricted-telegram-public',
    tools: [
        defineTool({
            name: 'search_help_articles',
            description: 'Cari panduan publik Polyflow.',
            parameters: Type.Object({ query: Type.String({ minLength: 1 }) }),
            replay: 'safe',
            execute: async ({ query }) => ({
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            await searchHelpArticles(query, undefined, 4),
                        ),
                    },
                ],
            }),
        }),
    ],
    sections: [
        section('persona', () => ASSISTANT_PERSONA),
        section(
            'restricted-telegram-policy',
            () =>
                'Hanya panduan publik. Jangan mengakses atau mengklaim data tenant, transaksi, user, role, atau permission.',
        ),
    ],
});

export class RestrictedTelegramRuntime {
    private harnessPromise?: Promise<HarnessInstance>;

    constructor(
        private readonly options: {
            root: string;
            models: Models;
            model: { provider: string; modelId: string };
        },
    ) {}

    storagePath(): string {
        return path.join(
            this.options.root,
            RESTRICTED_TELEGRAM_STORAGE_KEY,
            'assistant.sqlite',
        );
    }

    async submit(
        input: RestrictedTelegramEnvelope,
    ): Promise<RestrictedTelegramSnapshot> {
        const harness = await this.harness();
        const requestId = scopedRequestId(input);
        const questionHash = createHash('sha256')
            .update(input.question)
            .digest('hex');
        const conversationId = await harness.commit(async (tx) => {
            const binding = await tx.doc(RequestBindingDoc, requestId, {
                questionHash,
            });
            if (binding.questionHash !== questionHash) {
                throw new AssistantWorkerProtocolError(
                    'CONTEXT_MISMATCH',
                    'requestId is already bound to a different submission.',
                    409,
                );
            }
            if (binding.conversationId !== 0) return binding.conversationId;
            const created = await tx.createConversation({
                ownership: { kind: 'ownerless' },
            });
            binding.conversationId = Number(created.id);
            return Number(created.id);
        }, BACKGROUND_CONTEXT);
        const conversation = await harness.conversation(
            conversationId as never,
            BACKGROUND_CONTEXT,
        );
        if (!conversation) throw new Error('RESTRICTED_CONVERSATION_NOT_FOUND');
        await conversation.configure(
            {
                model: this.options.model,
                extensions: [RestrictedTelegramExtension],
            },
            BACKGROUND_CONTEXT,
        );
        const existing = await existingSubmission(
            harness,
            conversation,
            requestId,
        );
        const submission =
            existing ??
            (await conversation.submit(
                {
                    type: 'input',
                    content: input.question,
                    requestId,
                    whenBusy: 'reject',
                },
                BACKGROUND_CONTEXT,
            ));
        const settled = await submission.wait(BACKGROUND_CONTEXT);
        if (settled.status !== 'done' || settled.type !== 'input') {
            return {
                requestId: input.requestId,
                status: 'unanswered',
                accepted: true,
                error: {
                    code: 'UNANSWERED',
                    message: 'Assistant could not complete this submission.',
                    retryable: false,
                },
            };
        }
        const entry = await conversation.commit(
            (tx) => tx.entry(AssistantEntry, settled.answer),
            BACKGROUND_CONTEXT,
        );
        const message = entry?.model?.[0];
        const answer =
            message?.role === 'assistant'
                ? message.content
                      .filter((item) => item.type === 'text')
                      .map((item) => item.text)
                      .join('')
                : '';
        const response: AssistantResponse = {
            requestId: input.requestId,
            answer: answer || 'Maaf, panduan belum ditemukan.',
            citations: ['kb:public-only'],
            safety: { allowed: true },
        };
        return {
            requestId: input.requestId,
            status: 'done',
            accepted: true,
            response,
        };
    }

    async inspect(): Promise<{ ready: boolean; blockedTasks: number }> {
        const inspection = await (
            await this.harness()
        ).inspect(BACKGROUND_CONTEXT);
        const blockedTasks = inspection.tasks.filter(
            (task) => task.state.kind === 'blocked',
        ).length;
        return { ready: blockedTasks === 0, blockedTasks };
    }

    async close(): Promise<void> {
        const harness = await this.harnessPromise;
        if (harness) await harness.close(BACKGROUND_CONTEXT);
    }

    private async harness(): Promise<HarnessInstance> {
        this.harnessPromise ??= this.open();
        return this.harnessPromise;
    }

    private async open(): Promise<HarnessInstance> {
        const file = this.storagePath();
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        const registry = createRegistry();
        registry.install(RestrictedTelegramExtension);
        const harness = await Harness.open(
            await openNodeSqliteStorage(file),
            {
                models: this.options.models,
                registry,
                settings: {
                    extensions: [RestrictedTelegramExtension],
                    toolExecution: 'sequential',
                    retry: { maxRetries: 2 },
                },
            },
            BACKGROUND_CONTEXT,
        );
        harness.resume();
        return harness;
    }
}

function scopedRequestId(input: RestrictedTelegramEnvelope): string {
    return createHash('sha256')
        .update(
            `restricted-telegram:${input.integrationScope}:${input.requestId}`,
        )
        .digest('hex');
}

async function existingSubmission(
    harness: HarnessInstance,
    conversation: Conversation,
    requestId: string,
) {
    const existing = await conversation.commit(
        (tx) => tx.submissionByRequest(conversation.id, requestId),
        BACKGROUND_CONTEXT,
    );
    return existing
        ? harness.submission(existing.id, BACKGROUND_CONTEXT)
        : undefined;
}
