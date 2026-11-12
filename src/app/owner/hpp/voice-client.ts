import type { VoiceContext } from '@/lib/owner-hpp/voice-prompt';
import { z } from 'zod';

export const TRANSCRIBE_ENDPOINT = '/api/owner-hpp/transcribe';
const NETWORK_MESSAGE = 'Gagal mendengar, coba lagi atau ketik manual.';

const successSchema = z.object({
    success: z.literal(true),
    data: z.object({ text: z.string() }),
});
const failureSchema = z.object({
    success: z.literal(false),
    error: z.string(),
});

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Posts the recording to the server and returns the transcript. Throws an
 * Error with a friendly Indonesian message on any failure (also on non-JSON
 * replies, e.g. an HTML login page after a redirect).
 */
export async function requestTranscription(
    audio: Blob,
    context: VoiceContext,
    fetchImpl: typeof fetch = fetch,
): Promise<string> {
    const form = new FormData();
    form.append('file', audio, 'rekaman');
    form.append('context', JSON.stringify(context));
    let response: Response;
    try {
        response = await fetchImpl(TRANSCRIBE_ENDPOINT, {
            method: 'POST',
            body: form,
        });
    } catch {
        throw new Error(NETWORK_MESSAGE);
    }
    const body = await readJson(response);
    const ok = successSchema.safeParse(body);
    if (ok.success) return ok.data.data.text;
    const failed = failureSchema.safeParse(body);
    throw new Error(failed.success ? failed.data.error : NETWORK_MESSAGE);
}
