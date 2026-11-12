import { describe, expect, it, vi } from 'vitest';
import { requestTranscription, TRANSCRIBE_ENDPOINT } from '../voice-client';

const context = { stages: [] };
const audio = new Blob(['x'], { type: 'audio/mp4' });

describe('requestTranscription', () => {
    it('posts the recording with its context and returns the text', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(Response.json({ success: true, data: { text: 'halo' } }));

        const text = await requestTranscription(audio, context, fetchImpl);

        expect(text).toBe('halo');
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(TRANSCRIBE_ENDPOINT);
        expect(init.method).toBe('POST');
        expect((init.body as FormData).get('context')).toBe(JSON.stringify(context));
        expect((init.body as FormData).get('file')).toBeInstanceOf(Blob);
    });

    it('throws the server message on a failure reply', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(Response.json({ success: false, error: 'Rekaman terlalu besar.' }, { status: 413 }));

        await expect(requestTranscription(audio, context, fetchImpl)).rejects.toThrow('Rekaman terlalu besar.');
    });

    it('throws a friendly message when the reply is not JSON', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>login</html>'));

        await expect(requestTranscription(audio, context, fetchImpl)).rejects.toThrow('Gagal mendengar');
    });

    it('throws a friendly message when the network fails', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'));

        await expect(requestTranscription(audio, context, fetchImpl)).rejects.toThrow('Gagal mendengar');
    });
});
