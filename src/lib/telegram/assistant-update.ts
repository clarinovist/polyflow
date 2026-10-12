import { z } from 'zod';

const telegramId = z.union([
    z.number().int().safe(),
    z.string().regex(/^\d{1,20}$/),
]);
const userSchema = z.object({ id: telegramId }).strip();
const chatSchema = z
    .object({ id: telegramId, type: z.enum(['private', 'group', 'supergroup', 'channel']) })
    .strip();
const messageSchema = z
    .object({
        message_id: z.number().int().safe(),
        from: userSchema,
        chat: chatSchema,
        text: z.string().max(2000).optional(),
    })
    .strip();
const callbackSchema = z
    .object({
        id: z.string().min(1).max(128),
        from: userSchema,
        data: z.string().min(1).max(64),
        message: messageSchema,
    })
    .strip();

export const telegramAssistantUpdateSchema = z
    .object({
        update_id: z.number().int().safe(),
        message: messageSchema.optional(),
        callback_query: callbackSchema.optional(),
    })
    .strip()
    .refine((value) => !!value.message !== !!value.callback_query, {
        message: 'Exactly one supported Telegram event is required.',
    });

export type TelegramAssistantIngress = {
    updateId: string;
    type: 'message' | 'callback';
    telegramUserId: string;
    telegramChatId: string;
    sourceMessageId: string;
    callbackQueryId?: string;
    callbackData?: string;
    text?: string;
};

export type TelegramAssistantParseResult =
    | { ok: true; update: TelegramAssistantIngress }
    | {
          ok: false;
          reason: 'SCHEMA' | 'PRIVATE_ONLY' | 'SENDER_MISMATCH' | 'TEXT_REQUIRED';
      };

export function parseTelegramAssistantUpdate(
    input: unknown,
): TelegramAssistantParseResult {
    const parsed = telegramAssistantUpdateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, reason: 'SCHEMA' };
    const callback = parsed.data.callback_query;
    const source = callback?.message ?? parsed.data.message!;
    const sender = callback?.from ?? source.from;
    const chatId = String(source.chat.id);
    const senderId = String(sender.id);
    if (source.chat.type !== 'private') {
        return { ok: false, reason: 'PRIVATE_ONLY' };
    }
    // Telegram sets callback_query.message.from to the bot that originally sent
    // the inline keyboard. The human actor is callback_query.from. Ordinary
    // messages still require their message.from identity to match the private
    // chat so forwarded/spoofed shapes fail closed.
    if (
        senderId !== chatId ||
        (!callback && String(source.from.id) !== chatId)
    ) {
        return { ok: false, reason: 'SENDER_MISMATCH' };
    }
    if (callback) {
        return {
            ok: true,
            update: {
                updateId: String(parsed.data.update_id),
                type: 'callback',
                telegramUserId: senderId,
                telegramChatId: chatId,
                sourceMessageId: String(source.message_id),
                callbackQueryId: callback.id,
                callbackData: callback.data,
            },
        };
    }
    const text = source.text?.trim();
    if (!text) return { ok: false, reason: 'TEXT_REQUIRED' };
    return {
        ok: true,
        update: {
            updateId: String(parsed.data.update_id),
            type: 'message',
            telegramUserId: senderId,
            telegramChatId: chatId,
            sourceMessageId: String(source.message_id),
            text,
        },
    };
}
