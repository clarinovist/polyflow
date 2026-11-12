import { z } from 'zod';
import { VOICE_LIMITS } from './voice-commands';
import { fetchWithRetry, VoiceHttpError, type FetchLike } from './voice-http';

export const DEFAULT_STT_BASE_URL = 'https://api.groq.com/openai/v1';
export const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';
const STT_LANGUAGE = 'id';
const STT_RETRIES = 1;
const STT_PROMPT_MAX_CHARS = 600;

/** Allowed base mime types and the file extension the engine detects them by. */
export const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
};

export const STT_MESSAGES = {
    notConfigured: 'Input suara belum dikonfigurasi.',
    failed: 'Gagal mendengar, coba lagi atau ketik manual.',
    empty: 'Rekaman kosong, coba lagi.',
    tooLarge: 'Rekaman terlalu besar, bicara lebih singkat.',
    badType: 'Format rekaman tidak didukung.',
    silent: 'Suara tidak terdengar, coba lagi.',
} as const;

export interface SttConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
}

/** Reads server-only settings; null when the key is missing. */
export function readSttConfig(
    env: Readonly<Record<string, string | undefined>>,
): SttConfig | null {
    const apiKey = env.GROQ_API_KEY?.trim();
    if (!apiKey) return null;
    return {
        apiKey,
        baseUrl: env.STT_BASE_URL?.trim() || DEFAULT_STT_BASE_URL,
        model: env.STT_MODEL?.trim() || DEFAULT_STT_MODEL,
    };
}

/** "audio/webm;codecs=opus" -> "audio/webm". */
export function baseMimeType(mime: string): string {
    return mime.split(';')[0].trim().toLowerCase();
}

export type AudioCheck =
    | { ok: true; mime: string; extension: string }
    | { ok: false; error: string };

export function validateAudio(audio: {
    size: number;
    type: string;
}): AudioCheck {
    if (audio.size <= 0) return { ok: false, error: STT_MESSAGES.empty };
    if (audio.size > VOICE_LIMITS.maxAudioBytes) {
        return { ok: false, error: STT_MESSAGES.tooLarge };
    }
    const mime = baseMimeType(audio.type);
    const extension = AUDIO_EXTENSIONS[mime];
    if (!extension) return { ok: false, error: STT_MESSAGES.badType };
    return { ok: true, mime, extension };
}

const transcriptionSchema = z.object({ text: z.string() });

export type TranscribeResult =
    | { ok: true; text: string }
    | { ok: false; error: string };

interface TranscribeInput {
    audio: Blob;
    config: SttConfig;
    prompt: string;
    fetchImpl?: FetchLike;
}

function buildForm(
    audio: Blob,
    extension: string,
    config: SttConfig,
    prompt: string,
): FormData {
    const form = new FormData();
    form.append('file', audio, `rekaman.${extension}`);
    form.append('model', config.model);
    form.append('language', STT_LANGUAGE);
    form.append('temperature', '0');
    form.append('response_format', 'json');
    form.append('prompt', prompt.slice(0, STT_PROMPT_MAX_CHARS));
    return form;
}

async function readText(response: Response): Promise<TranscribeResult> {
    if (!response.ok) return { ok: false, error: STT_MESSAGES.failed };
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return { ok: false, error: STT_MESSAGES.failed };
    }
    const parsed = transcriptionSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: STT_MESSAGES.failed };
    const text = parsed.data.text
        .trim()
        .slice(0, VOICE_LIMITS.maxTranscriptLength);
    return text
        ? { ok: true, text }
        : { ok: false, error: STT_MESSAGES.silent };
}

/**
 * Sends the recording to the speech engine as-is. The key goes only in the
 * Authorization header; no error text carries the key, the audio or provider output.
 */
export async function transcribeAudio(
    input: TranscribeInput,
): Promise<TranscribeResult> {
    const check = validateAudio(input.audio);
    if (!check.ok) return check;

    const form = buildForm(
        input.audio,
        check.extension,
        input.config,
        input.prompt,
    );
    try {
        const response = await fetchWithRetry(
            input.fetchImpl ?? fetch,
            `${input.config.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${input.config.apiKey}` },
                body: form,
            },
            { timeoutMs: VOICE_LIMITS.requestTimeoutMs, retries: STT_RETRIES },
        );
        return await readText(response);
    } catch (error) {
        if (error instanceof VoiceHttpError) {
            return { ok: false, error: STT_MESSAGES.failed };
        }
        throw error;
    }
}
