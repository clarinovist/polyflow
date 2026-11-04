import { describe, expect, it } from 'vitest';
import {
    loadAssistantBrokerRuntimeConfig,
    loadAssistantWorkerRuntimeConfig,
} from '../runtime-config';
import { loadTelegramAssistantConfig } from '@/lib/telegram/assistant-config';

const base = {
    ASSISTANT_WORKER_TOKEN: 'w'.repeat(32),
    LLM_BASE_URL: 'https://llm.example.test',
    LLM_API_KEY: 'llm-key',
    LLM_MODEL: 'model-one',
};

describe('assistant worker optional Telegram config', () => {
    it.each([
        {},
        {
            TELEGRAM_ASSISTANT_BOT_TOKEN: '',
            TELEGRAM_ASSISTANT_BOT_KEY: '',
            TELEGRAM_ASSISTANT_WEBHOOK_SECRET: '',
            TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET: '',
            TELEGRAM_ASSISTANT_BOT_USERNAME: '',
            TELEGRAM_ASSISTANT_PUBLIC_BASE_URL: '',
        },
    ])('keeps base worker startup valid and Telegram disabled for %j', (telegram) => {
        const env = { ...base, ...telegram } as unknown as NodeJS.ProcessEnv;
        const runtime = loadAssistantWorkerRuntimeConfig(env);
        expect(runtime.ASSISTANT_WORKER_PORT).toBe(3010);
        expect(runtime.TELEGRAM_ASSISTANT_BOT_TOKEN).toBeUndefined();
        expect(() => loadTelegramAssistantConfig(env)).toThrow();
    });

    it('keeps broker routing default-off and validates its paired fields', () => {
        expect(loadAssistantWorkerRuntimeConfig(base).ASSISTANT_BROKER_URL).toBeUndefined();
        expect(
            loadAssistantWorkerRuntimeConfig({
                ...base,
                ASSISTANT_BROKER_URL: 'http://assistant-broker:3020',
                ASSISTANT_BROKER_TOKEN: 'b'.repeat(32),
                ASSISTANT_BROKER_ALLOWED_TOOLS: 'get_daily_production_output',
            }),
        ).toMatchObject({
            ASSISTANT_BROKER_URL: 'http://assistant-broker:3020',
            ASSISTANT_BROKER_ALLOWED_TOOLS: 'get_daily_production_output',
        });
        for (const invalid of ['bad tool', 'diagnose_production_blocker']) {
            expect(() =>
                loadAssistantWorkerRuntimeConfig({
                    ...base,
                    ASSISTANT_BROKER_ALLOWED_TOOLS: invalid,
                }),
            ).toThrow();
        }
    });

    it('requires explicit broker service configuration', () => {
        expect(
            loadAssistantBrokerRuntimeConfig({
                ASSISTANT_BROKER_TOKEN: 'b'.repeat(32),
            }),
        ).toMatchObject({
            ASSISTANT_BROKER_PORT: 3020,
            ASSISTANT_BROKER_ALLOWED_TOOLS: 'get_daily_production_output',
        });
        expect(() => loadAssistantBrokerRuntimeConfig({})).toThrow();
    });

    it.each([
        ['TELEGRAM_ASSISTANT_BOT_TOKEN', 'short'],
        ['TELEGRAM_ASSISTANT_BOT_KEY', 'not valid'],
        ['TELEGRAM_ASSISTANT_WEBHOOK_SECRET', 'short'],
        ['TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET', 'short'],
        ['TELEGRAM_ASSISTANT_BOT_USERNAME', 'bad-name'],
        ['TELEGRAM_ASSISTANT_PUBLIC_BASE_URL', 'not-a-url'],
    ])('still rejects a non-empty invalid %s', (key, value) => {
        expect(() =>
            loadAssistantWorkerRuntimeConfig({
                ...base,
                [key]: value,
            } as unknown as NodeJS.ProcessEnv),
        ).toThrow();
    });
});
