import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_LIMITS } from '../voice-commands';
import {
    baseMimeType,
    DEFAULT_STT_BASE_URL,
    DEFAULT_STT_MODEL,
    readSttConfig,
    STT_MESSAGES,
    transcribeAudio,
    validateAudio,
    type SttConfig,
} from '../voice-stt';

const FAKE_KEY = 'test-key-not-real';
const config: SttConfig = { apiKey: FAKE_KEY, baseUrl: 'https://stt.example.test/v1/', model: 'model-x' };

function audio(type = 'audio/mp4', size = 40_000): Blob {
    return new Blob([new Uint8Array(size)], { type });
}

function okResponse(text: string): Response {
    return Response.json({ text });
}

describe('readSttConfig', () => {
    it('is null without a key', () => {
        expect(readSttConfig({})).toBeNull();
        expect(readSttConfig({ GROQ_API_KEY: '   ' })).toBeNull();
    });

    it('applies defaults for model and base url', () => {
        expect(readSttConfig({ GROQ_API_KEY: FAKE_KEY })).toEqual({
            apiKey: FAKE_KEY, baseUrl: DEFAULT_STT_BASE_URL, model: DEFAULT_STT_MODEL,
        });
    });

    it('honours STT_MODEL and STT_BASE_URL', () => {
        expect(readSttConfig({ GROQ_API_KEY: FAKE_KEY, STT_MODEL: 'm', STT_BASE_URL: 'https://x.test' })).toEqual({
            apiKey: FAKE_KEY, baseUrl: 'https://x.test', model: 'm',
        });
    });
});

describe('validateAudio', () => {
    it('accepts allowed types including a codecs suffix', () => {
        expect(validateAudio(audio('audio/mp4'))).toMatchObject({ ok: true, extension: 'm4a' });
        expect(validateAudio(audio('audio/webm;codecs=opus'))).toMatchObject({ ok: true, mime: 'audio/webm', extension: 'webm' });
        expect(baseMimeType('Audio/WAV; x=1')).toBe('audio/wav');
    });

    it('rejects empty, oversized and unknown types', () => {
        expect(validateAudio(audio('audio/mp4', 0))).toEqual({ ok: false, error: STT_MESSAGES.empty });
        expect(validateAudio(audio('audio/mp4', VOICE_LIMITS.maxAudioBytes + 1))).toEqual({ ok: false, error: STT_MESSAGES.tooLarge });
        expect(validateAudio(audio('video/mp4'))).toEqual({ ok: false, error: STT_MESSAGES.badType });
        expect(validateAudio(audio(''))).toEqual({ ok: false, error: STT_MESSAGES.badType });
    });
});

describe('transcribeAudio', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('posts multipart to the transcription endpoint with the expected fields', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(okResponse('  harga 14.500  '));

        const result = await transcribeAudio({ audio: audio(), config, prompt: 'kosakata', fetchImpl });

        expect(result).toEqual({ ok: true, text: 'harga 14.500' });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://stt.example.test/v1/audio/transcriptions');
        expect(init.headers).toEqual({ Authorization: `Bearer ${FAKE_KEY}` });
        const form = init.body as FormData;
        expect(form.get('model')).toBe('model-x');
        expect(form.get('language')).toBe('id');
        expect(form.get('temperature')).toBe('0');
        expect(form.get('prompt')).toBe('kosakata');
        expect((form.get('file') as File).name).toBe('rekaman.m4a');
    });

    it('does not call the network for an invalid recording', async () => {
        const fetchImpl = vi.fn();

        const result = await transcribeAudio({ audio: audio('text/plain'), config, prompt: '', fetchImpl });

        expect(result).toEqual({ ok: false, error: STT_MESSAGES.badType });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('retries once after a network error and then succeeds', async () => {
        const fetchImpl = vi.fn()
            .mockRejectedValueOnce(new TypeError('boom'))
            .mockResolvedValueOnce(okResponse('halo'));

        const result = await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl });

        expect(result).toEqual({ ok: true, text: 'halo' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('gives up after the single retry with a friendly message', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('secret detail'));

        const result = await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl });

        expect(result).toEqual({ ok: false, error: STT_MESSAGES.failed });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('retries a 5xx once but never a 4xx', async () => {
        const server = vi.fn()
            .mockResolvedValueOnce(new Response('x', { status: 503 }))
            .mockResolvedValueOnce(okResponse('ok'));
        const client = vi.fn().mockResolvedValue(new Response('x', { status: 401 }));

        const retried = await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl: server });
        const rejected = await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl: client });

        expect(retried).toEqual({ ok: true, text: 'ok' });
        expect(server).toHaveBeenCalledTimes(2);
        expect(rejected).toEqual({ ok: false, error: STT_MESSAGES.failed });
        expect(client).toHaveBeenCalledTimes(1);
    });

    it('times out without retrying', async () => {
        const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        );

        const pending = transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl });
        await vi.advanceTimersByTimeAsync(VOICE_LIMITS.requestTimeoutMs + 1);
        const result = await pending;

        expect(result).toEqual({ ok: false, error: STT_MESSAGES.failed });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('rejects an unexpected response body and a silent transcript', async () => {
        const wrongShape = vi.fn().mockResolvedValue(Response.json({ nope: 1 }));
        const notJson = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
        const silent = vi.fn().mockResolvedValue(okResponse('   '));

        expect(await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl: wrongShape })).toEqual({ ok: false, error: STT_MESSAGES.failed });
        expect(await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl: notJson })).toEqual({ ok: false, error: STT_MESSAGES.failed });
        expect(await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl: silent })).toEqual({ ok: false, error: STT_MESSAGES.silent });
    });

    it('caps the transcript length', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(okResponse('a'.repeat(5000)));

        const result = await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl });

        expect(result.ok && result.text.length).toBe(VOICE_LIMITS.maxTranscriptLength);
    });

    it('never puts the key in an error result', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error(`leak ${FAKE_KEY}`));

        const result = await transcribeAudio({ audio: audio(), config, prompt: '', fetchImpl });

        expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    });
});
