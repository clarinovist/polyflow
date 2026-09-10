import { z } from 'zod';
import { assistantWorkContextHintSchema } from './assistant-work-context';

const chatRequestSchema = z.object({
    question: z.string().trim().min(1).max(2000),
    conversationId: z.string().trim().min(1).max(100).optional(),
    workContext: assistantWorkContextHintSchema.optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

export function parseChatRequestBody(
    raw: unknown,
):
    | { success: true; data: ChatRequestBody }
    | { success: false; error: string } {
    const parsed = chatRequestSchema.safeParse(raw);
    if (parsed.success) return { success: true, data: parsed.data };

    const question =
        raw && typeof raw === 'object' && 'question' in raw
            ? (raw as { question?: unknown }).question
            : undefined;
    if (typeof question === 'string' && question.trim().length > 2000) {
        return {
            success: false,
            error: 'Question is too long. Maximum 2000 characters allowed.',
        };
    }
    if (typeof question !== 'string' || question.trim().length === 0) {
        return { success: false, error: 'Question is required.' };
    }

    return { success: false, error: 'Request context is invalid.' };
}
