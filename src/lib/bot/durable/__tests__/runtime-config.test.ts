import { describe, expect, it } from 'vitest';
import { loadAssistantWorkerRuntimeConfig } from '../runtime-config';
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
