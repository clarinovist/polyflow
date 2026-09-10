import { z } from 'zod';
import type { AssistantUserContext } from './assistant-types';
import { checkToolAuthorization } from './tool-authorization';
import { isFeatureEnabled } from './feature-flags';

export const assistantWorkContextHintSchema = z.object({
    pathname: z.string().trim().min(1).max(300),
});

export type AssistantWorkContextHint = z.infer<
    typeof assistantWorkContextHintSchema
>;

export type AssistantWorkProfile = 'general' | 'finance' | 'production';
export type AssistantEntityContext =
    | { type: 'invoice'; id: string }
    | { type: 'production-order'; id: string };

export type AssistantWorkContext = {
    profile: AssistantWorkProfile;
    pathname: string;
    entity?: AssistantEntityContext;
};

const SAFE_ENTITY_ID = /^[A-Za-z0-9_-]{1,100}$/;

function canUseResource(
    context: AssistantUserContext,
    resource: string,
    sensitivity: 'normal' | 'financial' = 'normal',
): boolean {
    return checkToolAuthorization(
        {
            name: 'resolve_assistant_work_context',
            requiredResources: [resource],
            sensitivity,
        },
        context,
    ).allowed;
}

function safeSegment(value: string | undefined): string | undefined {
    if (!value) return undefined;
    let decoded: string;
    try {
        decoded = decodeURIComponent(value);
    } catch {
        return undefined;
    }
    return SAFE_ENTITY_ID.test(decoded) ? decoded : undefined;
}

/**
 * Treat browser URL data only as a navigation hint. Authority always comes
 * from the server-built AssistantUserContext and the tenant-scoped tool query.
 */
export function resolveAssistantWorkContext(
    rawHint: unknown,
    context: AssistantUserContext,
): AssistantWorkContext {
    const parsed = assistantWorkContextHintSchema.safeParse(rawHint);
    if (
        !parsed.success ||
        !isFeatureEnabled('assistant.contextualWorkProfiles')
    ) {
        return { profile: 'general', pathname: '/' };
    }

    const pathname = parsed.data.pathname.split(/[?#]/, 1)[0] || '/';
    if (!pathname.startsWith('/') || pathname.includes('\\')) {
        return { profile: 'general', pathname: '/' };
    }

    if (pathname === '/finance' || pathname.startsWith('/finance/')) {
        if (!canUseResource(context, '/finance', 'financial')) {
            return { profile: 'general', pathname: '/' };
        }

        const invoiceMatch = pathname.match(
            /^\/finance\/invoices\/sales\/([^/]+)\/?$/,
        );
        const invoiceId = safeSegment(invoiceMatch?.[1]);
        return {
            profile: 'finance',
            pathname,
            ...(invoiceId
                ? { entity: { type: 'invoice' as const, id: invoiceId } }
                : {}),
        };
    }

    if (pathname === '/production' || pathname.startsWith('/production/')) {
        if (!canUseResource(context, '/production/orders')) {
            return { profile: 'general', pathname: '/' };
        }

        const orderMatch = pathname.match(/^\/production\/orders\/([^/]+)\/?$/);
        const orderId =
            orderMatch?.[1] === 'create'
                ? undefined
                : safeSegment(orderMatch?.[1]);
        return {
            profile: 'production',
            pathname,
            ...(orderId
                ? {
                      entity: {
                          type: 'production-order' as const,
                          id: orderId,
                      },
                  }
                : {}),
        };
    }

    return { profile: 'general', pathname };
}

export function workContextKey(context: AssistantWorkContext): string {
    return [
        context.profile,
        context.pathname,
        context.entity?.type,
        context.entity?.id,
    ]
        .filter(Boolean)
        .join(':');
}
