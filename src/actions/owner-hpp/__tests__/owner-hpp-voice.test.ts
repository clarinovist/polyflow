import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guard: vi.fn() }));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/owner-hpp-access', () => ({
    requireOwnerHppAccess: mocks.guard,
}));

import { AuthorizationError } from '@/lib/errors/errors';
import { buildVoiceContext } from '@/lib/owner-hpp/voice-prompt';
import { chainScenario } from '@/lib/owner-hpp/__tests__/fixtures';
import { VOICE_LIMITS } from '@/lib/owner-hpp/voice-commands';
import { parseOwnerHppVoice } from '../owner-hpp-voice';

const context = buildVoiceContext(chainScenario(), 'ext');
const TRANSCRIPT = 'harga jual dua puluh satu ribu';

function llmReply(content: string): Response {
    return Response.json({ choices: [{ message: { content } }] });
}

function replyWith(commands: unknown): Response {
    return llmReply(JSON.stringify({ commands }));
}

describe('parseOwnerHppVoice', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({ db: {}, userId: 'u1' });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('LLM_BASE_URL', 'https://llm.example.test/v1');
        vi.stubEnv('LLM_MODEL', 'model-x');
        vi.stubEnv('LLM_API_KEY', 'test-key-not-real');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('calls the guard first and touches nothing when it rejects', async () => {
        mocks.guard.mockRejectedValue(new AuthorizationError('no'));

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(result).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns verified commands for a valid reply', async () => {
        fetchMock.mockResolvedValue(replyWith([{ op: 'set_sell_price', price: 21000, heard: 'dua puluh satu ribu' }]));

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(result).toMatchObject({ success: true, data: { warnings: [] } });
        expect(result.success && result.data.commands).toHaveLength(1);
        expect(mocks.guard.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    });

    it('skips a command whose number was not spoken', async () => {
        fetchMock.mockResolvedValue(replyWith([{ op: 'set_sell_price', price: 21_000_000, heard: 'x' }]));

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(result.success && result.data.commands).toEqual([]);
        expect(result.success && result.data.warnings[0]).toContain('tidak ada di ucapan');
    });

    it('sends the transcript as data and no prices from the context', async () => {
        fetchMock.mockResolvedValue(replyWith([]));

        await parseOwnerHppVoice(TRANSCRIPT, context);

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.messages[1].content).toContain(`<transkrip>\n${TRANSCRIPT}\n</transkrip>`);
        expect(body.messages[1].content).not.toContain('14500');
        expect(body.temperature).toBe(0);
    });

    it.each([
        ['not a string', 42],
        ['empty', '   '],
        ['too long', 'a'.repeat(VOICE_LIMITS.maxTranscriptLength + 1)],
    ])('rejects a transcript that is %s without calling the model', async (_name, transcript) => {
        const result = await parseOwnerHppVoice(transcript, context);

        expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid context', async () => {
        const result = await parseOwnerHppVoice(TRANSCRIPT, { stages: 'x' });

        expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails friendly when the LLM is not configured', async () => {
        vi.stubEnv('LLM_BASE_URL', '');
        vi.stubEnv('LLM_MODEL', '');

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(result).toMatchObject({ success: false, code: 'VOICE_PARSE_FAILED' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails friendly when the reply is not JSON', async () => {
        fetchMock.mockResolvedValue(llmReply('Tentu, saya bantu!'));

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(result).toEqual({
            success: false,
            error: 'Gagal memproses, coba lagi atau ketik manual.',
            code: 'VOICE_PARSE_FAILED',
        });
    });

    it('fails friendly when the reply is outside the schema', async () => {
        fetchMock.mockResolvedValue(replyWith([{ op: 'hapus_semua' }]));

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(result).toMatchObject({ success: false, code: 'VOICE_PARSE_FAILED' });
    });

    it('fails friendly on a timeout without a second attempt', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        );

        const pending = parseOwnerHppVoice(TRANSCRIPT, context);
        await vi.advanceTimersByTimeAsync(VOICE_LIMITS.requestTimeoutMs + 1);
        const result = await pending;

        expect(result).toMatchObject({ success: false, code: 'VOICE_PARSE_FAILED' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries once after a network error', async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError('net'))
            .mockResolvedValueOnce(replyWith([]));

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not leak provider details in the error', async () => {
        fetchMock.mockResolvedValue(new Response('internal stack trace sk-secret', { status: 500 }));

        const result = await parseOwnerHppVoice(TRANSCRIPT, context);

        expect(JSON.stringify(result)).not.toContain('sk-secret');
    });
});
