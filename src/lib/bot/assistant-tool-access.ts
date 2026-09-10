import type {
    AssistantToolDefinition,
    AssistantUserContext,
} from './assistant-types';
import { getToolsForContext } from './tool-registry';

export function getAvailableAssistantTools(
    context: AssistantUserContext | undefined,
    permissionsVerified: boolean,
): AssistantToolDefinition[] {
    if (!context) return [];
    return permissionsVerified
        ? getToolsForContext(context)
        : getToolsForContext({ ...context, allowedResources: [] });
}

export function findAllowedAssistantTool(
    availableTools: AssistantToolDefinition[],
    name: string,
): AssistantToolDefinition | undefined {
    return availableTools.find((tool) => tool.name === name);
}
