const TELEGRAM_TEXT_LIMIT = 4096;
const SAFE_FALLBACK =
    'Maaf, layanan Asisten Polyflow belum dapat merespons. Silakan coba lagi.';

export type TelegramInlineKeyboard = {
    inline_keyboard: Array<
        Array<{ text: string; callback_data: string }>
    >;
};

export type TelegramAssistantClientOptions = {
    token: string;
    fetch?: typeof fetch;
    baseUrl?: string;
};

export function formatTelegramPlainText(
    text: string,
    activeTenantName?: string,
): string {
    const normalized = text
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim();
    const prefix = activeTenantName
        ? `Workspace aktif: ${activeTenantName.trim().slice(0, 120)}\n\n`
        : '';
    const safe = normalized || SAFE_FALLBACK;
    const room = TELEGRAM_TEXT_LIMIT - prefix.length;
    if (room <= 1) return prefix.slice(0, TELEGRAM_TEXT_LIMIT);
    return `${prefix}${safe.length <= room ? safe : `${safe.slice(0, room - 1)}…`}`;
}

export class TelegramAssistantClient {
    private readonly fetcher: typeof fetch;
    private readonly baseUrl: string;

    constructor(private readonly options: TelegramAssistantClientOptions) {
        if (!options.token || options.token.length < 20) {
            throw new Error('TELEGRAM_ASSISTANT_BOT_TOKEN is invalid');
        }
        this.fetcher = options.fetch ?? fetch;
        this.baseUrl = options.baseUrl ?? 'https://api.telegram.org';
    }

    async sendMessage(input: {
        chatId: string;
        text: string;
        replyMarkup?: TelegramInlineKeyboard;
    }): Promise<{ messageId: string }> {
        const result = await this.call('sendMessage', {
            chat_id: input.chatId,
            text: formatTelegramPlainText(input.text),
            ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        });
        const messageId = readMessageId(result);
        if (!messageId) throw new Error('TELEGRAM_ASSISTANT_RESPONSE_INVALID');
        return { messageId };
    }

    async editMessageText(input: {
        chatId: string;
        messageId: string;
        text: string;
        replyMarkup?: TelegramInlineKeyboard;
    }): Promise<void> {
        await this.call('editMessageText', {
            chat_id: input.chatId,
            message_id: Number(input.messageId),
            text: formatTelegramPlainText(input.text),
            ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        });
    }

    async answerCallbackQuery(callbackQueryId: string): Promise<void> {
        await this.call('answerCallbackQuery', {
            callback_query_id: callbackQueryId,
        });
    }

    private async call(
        method: 'sendMessage' | 'editMessageText' | 'answerCallbackQuery',
        body: Record<string, unknown>,
    ): Promise<unknown> {
        let response: Response;
        try {
            response = await this.fetcher(
                `${this.baseUrl}/bot${this.options.token}/${method}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(10_000),
                },
            );
        } catch {
            throw new Error('TELEGRAM_ASSISTANT_UNAVAILABLE');
        }
        if (!response.ok) {
            // Never parse, return, or log Telegram's raw response body: it can
            // contain request-derived text and transport details.
            await response.body?.cancel().catch(() => undefined);
            const error = new Error(
                `TELEGRAM_ASSISTANT_HTTP_${response.status}`,
            );
            const transient =
                response.status === 408 ||
                response.status === 425 ||
                response.status === 429 ||
                response.status >= 500;
            if (transient) {
                const retryAfterMs = boundedRetryAfterMs(
                    response.headers.get('retry-after'),
                );
                Object.assign(error, {
                    retryable: true,
                    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
                });
            } else if (response.status >= 400 && response.status < 500) {
                Object.assign(error, { retryable: false });
            }
            throw error;
        }
        const parsed = (await response.json().catch(() => null)) as {
            ok?: boolean;
            result?: unknown;
        } | null;
        if (!parsed?.ok) {
            throw Object.assign(
                new Error('TELEGRAM_ASSISTANT_RESPONSE_INVALID'),
                { retryable: false },
            );
        }
        return parsed.result;
    }
}

function boundedRetryAfterMs(value: string | null): number | undefined {
    if (!value || !/^\d{1,3}$/.test(value)) return undefined;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds)) return undefined;
    return Math.min(seconds * 1000, 60_000);
}

function readMessageId(value: unknown): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const messageId = (value as { message_id?: unknown }).message_id;
    return typeof messageId === 'number' && Number.isSafeInteger(messageId)
        ? String(messageId)
        : null;
}
