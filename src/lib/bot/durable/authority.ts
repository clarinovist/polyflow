import { createHash } from 'node:crypto';
import { getMainPrisma, prisma } from '@/lib/core/prisma';
import { buildAssistantContext } from '../assistant-context';
import { verifyAssistantSessionUser } from '../assistant-session';
import { conversationAccessScope } from '../conversation-scope';
import {
    resolveAssistantWorkContext,
    workContextKey,
    type AssistantWorkContextHint,
} from '../assistant-work-context';
import type { AssistantUserContext } from '../assistant-types';
import {
    ASSISTANT_PROTOCOL_VERSION,
    AssistantWorkerProtocolError,
    assistantAuthoritySchema,
    type AssistantAuthority,
} from './protocol';
import { runInActiveTenant } from './tenant-runtime';

export type VerifiedDurableAuthority = {
    authority: AssistantAuthority;
    assistantContext: AssistantUserContext;
};

export function tenantStorageKey(tenantId: string): string {
    return createHash('sha256').update(tenantId).digest('hex');
}

export async function verifyDurableAuthority(input: {
    tenantId: string;
    userId: string;
    channel: AssistantAuthority['channel'];
    publicConversationId?: string;
    workContext: AssistantWorkContextHint;
}): Promise<VerifiedDurableAuthority> {
    return runInActiveTenant(input.tenantId, input.userId, async () => {
        const verified = await verifyAssistantSessionUser({ id: input.userId });
        if (!verified) {
            throw new AssistantWorkerProtocolError(
                'PERMISSION_DENIED',
                'Assistant access is no longer available.',
                403,
            );
        }
        const assistantContext = {
            ...buildAssistantContext(verified, input.tenantId),
            channel: input.channel,
        } satisfies AssistantUserContext;
        const workContext = resolveAssistantWorkContext(
            input.workContext,
            assistantContext,
        );
        const accessScopeHash = conversationAccessScope(assistantContext);
        const contextKey = workContextKey(workContext);

        const existingBinding = input.publicConversationId
            ? await getMainPrisma().assistantDurableBinding.findFirst({
                  where: {
                      publicConversationId: input.publicConversationId,
                      tenantId: input.tenantId,
                      userId: input.userId,
                      channel: input.channel,
                      accessScopeHash,
                      workContextKey: contextKey,
                  },
                  select: { publicConversationId: true },
              })
            : null;
        // A known durable binding with a different live scope is a hard
        // authorization failure. A legacy ID has no binding and starts fresh.
        if (input.publicConversationId && !existingBinding) {
            const anyBinding =
                await getMainPrisma().assistantDurableBinding.findUnique({
                    where: {
                        publicConversationId: input.publicConversationId,
                    },
                    select: {
                        tenantId: true,
                        userId: true,
                        channel: true,
                        accessScopeHash: true,
                        workContextKey: true,
                    },
                });
            if (
                anyBinding &&
                (anyBinding.tenantId !== input.tenantId ||
                    anyBinding.userId !== input.userId ||
                    anyBinding.channel !== input.channel)
            ) {
                throw new AssistantWorkerProtocolError(
                    'CONTEXT_MISMATCH',
                    'Conversation does not belong to the active user.',
                    403,
                );
            }
            // Same owner but a changed permission/work scope starts a fresh
            // durable conversation. The previous transcript remains history-
            // only and is never attached to the new model context.
        }
        const boundPublicConversationId = existingBinding?.publicConversationId;
        let conversation = boundPublicConversationId
            ? await prisma.helpConversation.findFirst({
                  where: {
                      id: boundPublicConversationId,
                      tenantId: input.tenantId,
                      userId: input.userId,
                      channel: input.channel,
                      status: 'ACTIVE',
                      assistantRuntime: 'pi-durable',
                      accessScopeHash,
                      workContextKey: contextKey,
                  },
              })
            : null;

        if (boundPublicConversationId && !conversation) {
            throw new AssistantWorkerProtocolError(
                'CONTEXT_MISMATCH',
                'Conversation does not belong to the active access context.',
                403,
            );
        }
        conversation ??= await prisma.helpConversation.create({
            data: {
                tenantId: input.tenantId,
                userId: input.userId,
                channel: input.channel,
                assistantRuntime: 'pi-durable',
                accessScopeHash,
                workContextKey: contextKey,
                durableVersion: ASSISTANT_PROTOCOL_VERSION,
            },
        });

        const authority = assistantAuthoritySchema.parse({
            schemaVersion: ASSISTANT_PROTOCOL_VERSION,
            publicConversationId: conversation.id,
            tenantId: input.tenantId,
            userId: input.userId,
            channel: input.channel,
            accessScopeHash,
            workContextKey: contextKey,
            pathname: workContext.pathname,
            profile: workContext.profile,
        });
        return { authority, assistantContext };
    });
}

export async function withBoundAuthority<T>(
    expected: AssistantAuthority,
    operation: (verified: VerifiedDurableAuthority) => Promise<T>,
): Promise<T> {
    return runInActiveTenant(expected.tenantId, expected.userId, async () => {
        const verified = await verifyAssistantSessionUser({
            id: expected.userId,
        });
        if (!verified) {
            throw new AssistantWorkerProtocolError(
                'PERMISSION_DENIED',
                'Assistant access is no longer available.',
                403,
            );
        }
        const assistantContext = {
            ...buildAssistantContext(verified, expected.tenantId),
            channel: expected.channel,
        } satisfies AssistantUserContext;
        const workContext = resolveAssistantWorkContext(
            { pathname: expected.pathname },
            assistantContext,
        );
        const current = assistantAuthoritySchema.parse({
            ...expected,
            accessScopeHash: conversationAccessScope(assistantContext),
            workContextKey: workContextKey(workContext),
            pathname: workContext.pathname,
            profile: workContext.profile,
        });
        const conversation = await prisma.helpConversation.findFirst({
            where: {
                id: expected.publicConversationId,
                tenantId: expected.tenantId,
                userId: expected.userId,
                channel: expected.channel,
                status: 'ACTIVE',
                assistantRuntime: 'pi-durable',
                accessScopeHash: expected.accessScopeHash,
                workContextKey: expected.workContextKey,
            },
            select: { id: true },
        });
        if (
            !conversation ||
            current.accessScopeHash !== expected.accessScopeHash ||
            current.workContextKey !== expected.workContextKey
        ) {
            throw new AssistantWorkerProtocolError(
                'CONTEXT_MISMATCH',
                'Assistant access context changed.',
                403,
            );
        }
        return operation({ authority: current, assistantContext });
    });
}

export async function assertBoundAuthority(
    expected: AssistantAuthority,
): Promise<VerifiedDurableAuthority> {
    return withBoundAuthority(expected, async (verified) => verified);
}

export async function saveDurableBinding(
    authority: AssistantAuthority,
    durableConversationId: number,
): Promise<void> {
    await getMainPrisma().assistantDurableBinding.upsert({
        where: { publicConversationId: authority.publicConversationId },
        create: {
            publicConversationId: authority.publicConversationId,
            tenantId: authority.tenantId,
            userId: authority.userId,
            channel: authority.channel,
            accessScopeHash: authority.accessScopeHash,
            workContextKey: authority.workContextKey,
            storageKey: tenantStorageKey(authority.tenantId),
            durableConversationId: String(durableConversationId),
            storageVersion: ASSISTANT_PROTOCOL_VERSION,
            pathname: authority.pathname,
            profile: authority.profile,
        },
        update: {
            accessScopeHash: authority.accessScopeHash,
            workContextKey: authority.workContextKey,
            storageKey: tenantStorageKey(authority.tenantId),
            durableConversationId: String(durableConversationId),
            storageVersion: ASSISTANT_PROTOCOL_VERSION,
            pathname: authority.pathname,
            profile: authority.profile,
        },
    });
}
