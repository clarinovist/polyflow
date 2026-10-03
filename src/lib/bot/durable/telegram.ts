import { createHash } from 'node:crypto';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
    AssistantEntry,
    createRegistry,
    Harness,
    type Harness as HarnessInstance,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { mkdir } from 'node:fs/promises';
import { Type } from '@earendil-works/pi-ai';
import { searchHelpArticles } from '../help-articles';
import { detectGreeting } from '../greeting';
import { ASSISTANT_PERSONA } from '../assistant-persona';
import {
    defineExtension,
    defineTool,
    section,
} from '@earendil-works/pi-durable';
import { loadAssistantWorkerRuntimeConfig } from './runtime-config';
import { createDurableModels, POLYFLOW_MODEL_PROVIDER } from './model';
import type { AssistantResponse } from '../assistant-types';

let harnessPromise: Promise<HarnessInstance> | undefined;

async function telegramHarness() {
    if (harnessPromise) return harnessPromise;
    harnessPromise = (async () => {
        const config = loadAssistantWorkerRuntimeConfig();
        const { models } = createDurableModels({
            baseUrl: config.LLM_BASE_URL,
            modelId: config.LLM_MODEL,
            contextWindow: config.LLM_CONTEXT_WINDOW,
            maxTokens: config.LLM_MAX_TOKENS,
        });
        const search = defineTool({
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
        });
        const extension = defineExtension({
            name: 'polyflow-telegram-public',
            tools: [search],
            sections: [
                section('persona', () => ASSISTANT_PERSONA),
                section(
                    'telegram-policy',
                    () =>
                        'Hanya panduan publik. Jangan mengakses atau mengklaim data tenant, transaksi, user, atau permission.',
                ),
            ],
        });
        const registry = createRegistry();
        registry.install(extension);
        const directory = `${config.ASSISTANT_STORAGE_ROOT}/telegram-public`;
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const file = `${directory}/assistant.sqlite`;
        const opened = await Harness.open(
            await openNodeSqliteStorage(file),
            {
                models,
                registry,
                settings: {
                    extensions: [extension],
                    toolExecution: 'sequential',
                },
            },
            BACKGROUND_CONTEXT,
        );
        opened.resume();
        return opened;
    })();
    return harnessPromise;
}

export async function runRestrictedTelegramSubmission(input: {
    requestId: string;
    question: string;
}): Promise<AssistantResponse> {
    const greeting = detectGreeting(input.question);
    if (greeting.isGreeting && greeting.reply) {
        return {
            answer: greeting.reply,
            citations: ['policy:greeting'],
            safety: { allowed: true },
        };
    }
    const harness = await telegramHarness();
    const conversation = await harness.root(BACKGROUND_CONTEXT, {
        agent: {
            model: {
                provider: POLYFLOW_MODEL_PROVIDER,
                modelId: loadAssistantWorkerRuntimeConfig().LLM_MODEL,
            },
        },
    });
    const requestId = createHash('sha256')
        .update(`telegram:${input.requestId}`)
        .digest('hex');
    const submission = await conversation.submit(
        { type: 'input', content: input.question, requestId },
        BACKGROUND_CONTEXT,
    );
    const settled = await submission.wait(BACKGROUND_CONTEXT);
    if (settled.status !== 'done' || settled.type !== 'input') {
        throw new Error('TELEGRAM_ASSISTANT_UNANSWERED');
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
    return {
        answer: answer || 'Maaf, panduan belum ditemukan.',
        citations: ['kb:public-only'],
        safety: { allowed: true },
    };
}
