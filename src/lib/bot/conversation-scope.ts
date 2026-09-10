import { createHash } from 'node:crypto';
import type { AssistantUserContext } from './assistant-types';
import { isFeatureEnabled } from './feature-flags';

/** Fail closed on any grant/role/policy change, including legacy messages. */
export function conversationAccessScope(context: AssistantUserContext): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                version: 1,
                tenantId: context.tenantId,
                userId: context.userId,
                roles: [...new Set(context.roles)].sort(),
                resources:
                    context.allowedResources === 'ALL'
                        ? 'ALL'
                        : [...new Set(context.allowedResources)].sort(),
                sensitiveDomains: isFeatureEnabled(
                    'assistant.sensitiveDomains',
                ),
                tenantKnowledge: isFeatureEnabled('assistant.tenantKnowledge'),
            }),
        )
        .digest('hex');
}
