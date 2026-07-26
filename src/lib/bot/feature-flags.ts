/**
 * Feature flags for the AI assistant.
 * Controls rollout of new features per tenant/phase.
 */

export type AssistantFeatureFlag =
  | 'assistant.permissionAwareTools'
  | 'assistant.conversations'
  | 'assistant.tenantKnowledge'
  | 'assistant.crossModuleDiagnosis'
  | 'assistant.sensitiveDomains';

const FEATURE_FLAGS: Record<AssistantFeatureFlag, { enabled: boolean; description: string }> = {
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
    description: 'Enable HRD and sensitive data access (requires security review)',
  },
};

/**
 * Check if a feature flag is enabled.
 */
export function isFeatureEnabled(flag: AssistantFeatureFlag): boolean {
  return FEATURE_FLAGS[flag]?.enabled ?? false;
}

/**
 * Get all feature flags with their status.
 */
export function getAllFeatureFlags(): Record<AssistantFeatureFlag, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(FEATURE_FLAGS)) {
    result[key as AssistantFeatureFlag] = value.enabled;
  }
  return result as Record<AssistantFeatureFlag, boolean>;
}

/**
 * Toggle a feature flag (for admin use).
 */
export function toggleFeatureFlag(flag: AssistantFeatureFlag, enabled: boolean): void {
  if (FEATURE_FLAGS[flag]) {
    FEATURE_FLAGS[flag].enabled = enabled;
  }
}
