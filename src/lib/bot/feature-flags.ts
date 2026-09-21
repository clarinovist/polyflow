/**
 * Feature flags for the AI assistant.
 * Controls rollout of new features per tenant/phase.
 */

export type AssistantFeatureFlag =
    | 'assistant.permissionAwareTools'
    | 'assistant.conversations'
    | 'assistant.tenantKnowledge'
    | 'assistant.crossModuleDiagnosis'
    | 'assistant.sensitiveDomains'
    | 'assistant.proactiveDigest'
    | 'assistant.findingLifecycle'
    | 'assistant.contextualWorkProfiles';

const FEATURE_FLAGS: Record<
    AssistantFeatureFlag,
    { enabled: boolean; description: string }
> = {
    'assistant.permissionAwareTools': {
        enabled: true,
        description: 'Filter tools based on user permissions',
    },
    'assistant.conversations': {
        enabled: true,
        description: 'Persist conversation history and support follow-ups',
    },
    'assistant.tenantKnowledge': {
        enabled: true,
        description: 'Enable tenant-private SOP and knowledge articles',
    },
    'assistant.crossModuleDiagnosis': {
        enabled: true,
        description: 'Enable cross-module diagnosis workflows',
    },
    'assistant.sensitiveDomains': {
        enabled: false,
        description:
            'Enable HRD and sensitive data access (requires security review)',
    },
    'assistant.proactiveDigest': {
        enabled: false,
        description:
            'Enable proactive daily exception digest via Telegram cron',
    },
    'assistant.findingLifecycle': {
        enabled: false,
        description:
            'Sync detector results into claimable Finding records (production + warehouse only for now)',
    },
    'assistant.contextualWorkProfiles': {
        enabled: false,
        description:
            'Enable permission-aware Finance and Production work profiles on web routes',
    },
};

/**
 * Check if a feature flag is enabled.
 */
export function isFeatureEnabled(flag: AssistantFeatureFlag): boolean {
    if (flag === 'assistant.contextualWorkProfiles') {
        return process.env.ASSISTANT_CONTEXTUAL_PROFILES === 'true';
    }
    return FEATURE_FLAGS[flag]?.enabled ?? false;
}
