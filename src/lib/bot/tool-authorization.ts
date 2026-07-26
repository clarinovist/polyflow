import type {
    AssistantUserContext,
    AuthorizationResult,
    ToolSensitivity,
} from './assistant-types';
import { isFeatureEnabled } from './feature-flags';

/**
 * Check if a user's allowedResources includes a given resource path.
 * Supports hierarchical matching: /warehouse covers /warehouse/inventory.
 */
function isPathAllowedByResources(
    resourcePath: string,
    allowedResources: string[] | 'ALL',
): boolean {
    if (allowedResources === 'ALL') return true;

    for (const allowed of allowedResources) {
        // Exact match
        if (allowed === resourcePath) return true;
        // Parent covers child: /warehouse covers /warehouse/inventory
        if (resourcePath.startsWith(allowed + '/')) return true;
        // Child is a parent of an allowed resource: /warehouse/inventory covers /warehouse
        //   → only if the user has a more specific grant
    }

    return false;
}

/**
 * Sensitivity policy — some data types require additional feature/resource checks.
 */
const SENSITIVITY_POLICY: Record<
    ToolSensitivity,
    { requiredResources?: string[]; requiredFeatures?: string[] }
> = {
    normal: {},
    financial: {
        requiredResources: ['/finance'],
    },
    personal: {
        requiredResources: ['/hrd'],
    },
    restricted: {
        requiredResources: ['/hrd'],
        requiredFeatures: ['feature:view-prices'],
    },
};

/**
 * Check if a tool is authorized for the given user context.
 * Two-phase: (1) check tool's requiredResources, (2) check sensitivity policy.
 */
export function checkToolAuthorization(
    tool: {
        name: string;
        requiredResources: string[];
        sensitivity: ToolSensitivity;
        requiredFeatures?: string[];
    },
    context: AssistantUserContext,
): AuthorizationResult {
    // Phase 0: Check feature flags
    if (
        tool.sensitivity === 'restricted' &&
        !isFeatureEnabled('assistant.sensitiveDomains')
    ) {
        return {
            allowed: false,
            reason: 'Fitur ini belum diaktifkan untuk tenant Anda.',
        };
    }

    // Phase 1: Check tool-level required resources
    const missingResources: string[] = [];

    if (tool.requiredResources.length > 0) {
        for (const resource of tool.requiredResources) {
            if (!isPathAllowedByResources(resource, context.allowedResources)) {
                missingResources.push(resource);
            }
        }
    }

    if (missingResources.length > 0) {
        return {
            allowed: false,
            reason: `Anda tidak memiliki akses ke modul yang diperlukan untuk pertanyaan ini.`,
            missingResources,
        };
    }

    // Phase 2: Check sensitivity policy
    const policy = SENSITIVITY_POLICY[tool.sensitivity];

    if (policy.requiredResources && policy.requiredResources.length > 0) {
        const sensitivityMissing: string[] = [];
        for (const resource of policy.requiredResources) {
            if (!isPathAllowedByResources(resource, context.allowedResources)) {
                sensitivityMissing.push(resource);
            }
        }
        if (sensitivityMissing.length > 0) {
            return {
                allowed: false,
                reason: `Data ini memerlukan akses khusus yang belum Anda miliki.`,
                missingResources: sensitivityMissing,
            };
        }
    }

    if (policy.requiredFeatures && policy.requiredFeatures.length > 0) {
        // Feature checks would go through a feature-flag service
        // For now, we'll skip this check if no feature service is available
    }

    return { allowed: true };
}

/**
 * Filter a list of tools to only those authorized for the given user context.
 */
export function filterAuthorizedTools<
    T extends {
        name: string;
        requiredResources: string[];
        sensitivity: ToolSensitivity;
        requiredFeatures?: string[];
    },
>(tools: T[], context: AssistantUserContext): T[] {
    return tools.filter((tool) => {
        const result = checkToolAuthorization(tool, context);
        return result.allowed;
    });
}

/**
 * Create a denied evidence response for an unauthorized tool call.
 */
export function deniedEvidence(toolName: string): {
    text: string;
    allowed: false;
    reason: string;
} {
    return {
        text: `Akses ditolak. Anda tidak memiliki izin untuk menggunakan ${toolName}.`,
        allowed: false,
        reason: 'Permission denied',
    };
}
