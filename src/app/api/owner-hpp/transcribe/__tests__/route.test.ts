import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guard: vi.fn() }));

vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: unknown) => handler,
}));
vi.mock('@/lib/auth/owner-hpp-access', () => ({
    requireOwnerHppAccess: mocks.guard,
}));

import { AuthorizationError } from '@/lib/errors/errors';
import { VOICE_LIMITS } from '@/lib/owner-hpp/voice-commands';
import { buildVoiceContext } from '@/lib/owner-hpp/voice-prompt';
import { chainScenario } from '@/lib/owner-hpp/__tests__/fixtures';
import { POST } from '../route';

const FAKE_KEY = 'test-key-not-real';
const call = POST as unknown as (request: Request) => Promise<Response>;

function audioRequest(
    options: { type?: string; size?: number; context?: unknown; headers?: Record<string, string> } = {},
): Request {
    const { type = 'audio/mp4', size = 40_000, context, headers } = options;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(size)], { type }), 'rekaman');
    if (context !== undefined) form.append('context', JSON.stringify(context));
    return new Request('https://app.example.test/api/owner-hpp/transcribe', {
        method: 'POST',
        body: form,
        headers,
    });
}

describe('POST /api/owner-hpp/transcribe', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({ db: {}, userId: 'u1' });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('GROQ_API_KEY', FAKE_KEY);
        fetchMock.mockResolvedValue(Response.json({ text: 'harga 14.500' }));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('runs the guard before reading the body and stops when it rejects', async () => {
        mocks.guard.mockRejectedValue(new AuthorizationError('Tidak boleh'));
        const request = audioRequest();
        const formData = vi.spyOn(request, 'formData');

        const response = await call(request);

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(formData).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('answers 401 JSON when the guard redirects to login', async () => {
        mocks.guard.mockRejectedValue(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login' }));

        const response = await call(audioRequest());

        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ success: false });
    });

    it('answers 401 for an unexpected guard error', async () => {
        mocks.guard.mockRejectedValue(new Error('db down'));

        const response = await call(audioRequest());

        expect(response.status).toBe(401);
    });

    it('returns the transcript on success and posts audio to the engine', async () => {
        const context = buildVoiceContext(chainScenario(), 'ext');

        const response = await call(audioRequest({ context }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, data: { text: 'harga 14.500' } });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
        expect(init.headers).toEqual({ Authorization: `Bearer ${FAKE_KEY}` });
        expect((init.body as FormData).get('prompt')).toContain('Masterbatch');
    });

    it('falls back to the base vocabulary for a bad context', async () => {
        const response = await call(audioRequest({ context: { stages: 'x' } }));

        expect(response.status).toBe(200);
        expect((fetchMock.mock.calls[0][1].body as FormData).get('prompt')).toContain('Kalkulator HPP');
    });

    it('fails with 503 when GROQ_API_KEY is empty', async () => {
        vi.stubEnv('GROQ_API_KEY', '');

        const response = await call(audioRequest());

        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: 'STT_NOT_CONFIGURED' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an oversized declared body before parsing it', async () => {
        const request = audioRequest({ headers: { 'content-length': String(VOICE_LIMITS.maxAudioBytes + 100_000) } });
        const formData = vi.spyOn(request, 'formData');

        const response = await call(request);

        expect(response.status).toBe(413);
        expect(formData).not.toHaveBeenCalled();
    });

    it('rejects an oversized file that lied about its length', async () => {
        const response = await call(audioRequest({ size: VOICE_LIMITS.maxAudioBytes + 1 }));

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: 'INVALID_AUDIO' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a mime type outside the allow-list', async () => {
        const response = await call(audioRequest({ type: 'application/pdf' }));

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an empty recording', async () => {
        const response = await call(audioRequest({ size: 0 }));

        expect(response.status).toBe(400);
    });

    it('rejects a body that is not multipart with a file', async () => {
        const notForm = new Request('https://app.example.test/api/owner-hpp/transcribe', { method: 'POST', body: 'x' });
        const noFile = new Request('https://app.example.test/api/owner-hpp/transcribe', {
            method: 'POST',
            body: (() => { const f = new FormData(); f.append('file', 'teks'); return f; })(),
        });

        expect((await call(notForm)).status).toBe(400);
        expect((await call(noFile)).status).toBe(400);
    });

    it('answers 502 with a friendly message when the engine fails, without the key', async () => {
        fetchMock.mockResolvedValue(new Response(`error ${FAKE_KEY}`, { status: 401 }));

        const response = await call(audioRequest());
        const text = JSON.stringify(await response.json());

        expect(response.status).toBe(502);
        expect(text).toContain('Gagal mendengar');
        expect(text).not.toContain(FAKE_KEY);
    });
});
