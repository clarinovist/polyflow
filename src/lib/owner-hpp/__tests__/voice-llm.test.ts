import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_LIMITS } from '../voice-commands';
import { LLM_MESSAGES, readLlmConfig, requestVoiceCompletion } from '../voice-llm';

const config = { apiKey: 'test-key-not-real', baseUrl: 'https://llm.example.test/v1', model: 'm1' };

function completion(content: string): Response {
    return Response.json({ choices: [{ message: { content } }] });
}

describe('readLlmConfig', () => {
    it('needs a base url and a model', () => {
        expect(readLlmConfig({})).toBeNull();
        expect(readLlmConfig({ LLM_BASE_URL: 'https://x.test' })).toBeNull();
        expect(readLlmConfig({ LLM_BASE_URL: 'https://x.test', LLM_MODEL: 'm' })).toEqual({
            apiKey: '', baseUrl: 'https://x.test', model: 'm',
        });
    });

    it('reads the key from the same fallbacks as the chatbot', () => {
        const env = { LLM_BASE_URL: 'https://x.test', LLM_MODEL: 'm', OPENROUTER_API_KEY: 'k' };

        expect(readLlmConfig(env)?.apiKey).toBe('k');
        expect(readLlmConfig({ FIREWORKS_API_KEY: 'f', FIREWORKS_MODEL_ID: 'fm' })).toMatchObject({
            apiKey: 'f', model: 'fm', baseUrl: 'https://api.fireworks.ai/inference/v1',
        });
    });
});

describe('requestVoiceCompletion', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('sends a temperature 0 JSON request without tools', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(completion('{"commands":[]}'));

        const result = await requestVoiceCompletion({ config, system: 'S', user: 'U', fetchImpl });

        expect(result).toEqual({ ok: true, content: '{"commands":[]}' });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://llm.example.test/v1/chat/completions');
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({ model: 'm1', temperature: 0, response_format: { type: 'json_object' } });
        expect(body.messages).toEqual([{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
        expect(body).not.toHaveProperty('tools');
    });

    it('omits Authorization when there is no key', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(completion('{}'));

        await requestVoiceCompletion({ config: { ...config, apiKey: '' }, system: 'S', user: 'U', fetchImpl });

        expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    });

    it('retries once after a network error', async () => {
        const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValueOnce(completion('{}'));

        const result = await requestVoiceCompletion({ config, system: 'S', user: 'U', fetchImpl });

        expect(result.ok).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('fails friendly on a timeout, a 4xx and a malformed body', async () => {
        const hang = vi.fn((_u: string, init?: RequestInit) =>
            new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('a')))),
        );
        const pending = requestVoiceCompletion({ config, system: 'S', user: 'U', fetchImpl: hang });
        await vi.advanceTimersByTimeAsync(VOICE_LIMITS.requestTimeoutMs + 1);

        expect(await pending).toEqual({ ok: false, error: LLM_MESSAGES.failed });
        expect(hang).toHaveBeenCalledTimes(1);
        const denied = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
        expect(await requestVoiceCompletion({ config, system: 'S', user: 'U', fetchImpl: denied })).toEqual({ ok: false, error: LLM_MESSAGES.failed });
        const odd = vi.fn().mockResolvedValue(Response.json({ choices: [] }));
        expect(await requestVoiceCompletion({ config, system: 'S', user: 'U', fetchImpl: odd })).toEqual({ ok: false, error: LLM_MESSAGES.failed });
        const html = vi.fn().mockResolvedValue(new Response('<html>'));
        expect(await requestVoiceCompletion({ config, system: 'S', user: 'U', fetchImpl: html })).toEqual({ ok: false, error: LLM_MESSAGES.failed });
    });
});
