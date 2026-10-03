import type { Prisma } from '@prisma/client';
import {
    type Harness,
    type EntryId,
    type ConversationId,
} from '@earendil-works/pi-durable';
import { PresentationEntry } from './documents';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantResponse } from '../assistant-types';

export async function readDurablePresentation(
    harness: Harness,
    conversationId: ConversationId,
    userEntryId: EntryId,
    answerEntryId: EntryId,
    requestId: string,
): Promise<AssistantResponse | undefined> {
    const conversation = await harness.conversation(
        conversationId,
        BACKGROUND_CONTEXT,
    );
    if (!conversation) return undefined;
    const page = await conversation.entries(
        { minEntryId: userEntryId, maxEntryId: answerEntryId },
        20,
        undefined,
        BACKGROUND_CONTEXT,
    );
    for (const entry of page.items) {
        if (
            !PresentationEntry.is(entry) ||
            entry.data.requestId !== requestId
        ) {
            continue;
        }
        return entry.data.response as unknown as AssistantResponse;
    }
    return undefined;
}

export function serializeAssistantResponse(
    response: AssistantResponse,
): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
}
