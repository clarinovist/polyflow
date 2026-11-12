import { z } from 'zod';
import { VOICE_LIMITS } from './voice-commands';
import { fetchWithRetry, VoiceHttpError, type FetchLike } from './voice-http';

const LLM_RETRIES = 1;
const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';

export const LLM_MESSAGES = {
    notConfigured: 'Pemroses perintah suara belum dikonfigurasi.',
    failed: 'Gagal memproses, coba lagi atau ketik manual.',
} as const;

export interface LlmConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Same variables as the chatbot; no local default, so a missing setup fails fast. */
export function readLlmConfig(env: Env): LlmConfig | null {
    const apiKey = (
        env.LLM_API_KEY ||
        env.OPENAI_API_KEY ||
        env.OPENROUTER_API_KEY ||
        env.FIREWORKS_API_KEY ||
        ''
    ).trim();
    const baseUrl = (
        env.LLM_BASE_URL || (env.FIREWORKS_API_KEY ? FIREWORKS_BASE_URL : '')
    ).trim();
    const model = (env.LLM_MODEL || env.FIREWORKS_MODEL_ID || '').trim();
    if (!baseUrl || !model) return null;
    return { apiKey, baseUrl, model };
}

const completionSchema = z.object({
    choices: z
        .array(z.object({ message: z.object({ content: z.string() }) }))
        .min(1),
});

export type CompletionResult =
    | { ok: true; content: string }
    | { ok: false; error: string };

interface CompletionInput {
    config: LlmConfig;
    system: string;
    user: string;
    fetchImpl?: FetchLike;
}

function buildHeaders(config: LlmConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    };
}

async function readContent(response: Response): Promise<CompletionResult> {
    if (!response.ok) return { ok: false, error: LLM_MESSAGES.failed };
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return { ok: false, error: LLM_MESSAGES.failed };
    }
    const parsed = completionSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: LLM_MESSAGES.failed };
    return { ok: true, content: parsed.data.choices[0].message.content };
}

/** One JSON-only chat completion, temperature 0, no tools. */
export async function requestVoiceCompletion(
    input: CompletionInput,
): Promise<CompletionResult> {
    const { config } = input;
    try {
        const response = await fetchWithRetry(
            input.fetchImpl ?? fetch,
            `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
            {
                method: 'POST',
                headers: buildHeaders(config),
                body: JSON.stringify({
                    model: config.model,
                    temperature: 0,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: input.system },
                        { role: 'user', content: input.user },
                    ],
                }),
            },
            { timeoutMs: VOICE_LIMITS.requestTimeoutMs, retries: LLM_RETRIES },
        );
        return await readContent(response);
    } catch (error) {
        if (error instanceof VoiceHttpError) {
            return { ok: false, error: LLM_MESSAGES.failed };
        }
        throw error;
    }
}
