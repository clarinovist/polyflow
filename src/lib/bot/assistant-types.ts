import { z } from 'zod';

// ---------------------------------------------------------------------------
// Assistant User Context — built server-side from session + tenant
// ---------------------------------------------------------------------------

export type AssistantUserContext = {
    userId: string;
    requesterName?: string;
    activeRole?: string;
    roles: string[];
    allowedResources: string[] | 'ALL';
    tenantId: string;
    channel: 'web' | 'telegram' | 'telegram_mini_app';
    locale: string;
};

// ---------------------------------------------------------------------------
// Tool Evidence — structured output from every tool
// ---------------------------------------------------------------------------

export type ToolEvidenceSource =
    | 'tenant-data'
    | 'global-kb'
    | 'tenant-kb'
    | 'audit-log';

export type ToolEvidenceFact = {
    label: string;
    value: string;
};

export type ToolEvidenceEntity = {
    type: string;
    id: string;
    label: string;
    href?: string;
};

export type ToolEvidence = {
    summary: string;
    facts: ToolEvidenceFact[];
    entities?: ToolEvidenceEntity[];
    source: ToolEvidenceSource;
    checkedAt: string;
    completeness: 'complete' | 'partial';
};

// ---------------------------------------------------------------------------
// Tool Definition — permission-aware registry entry
// ---------------------------------------------------------------------------

export type ToolSensitivity =
    | 'normal'
    | 'financial'
    | 'personal'
    | 'restricted';

export type AssistantToolDefinition = {
    name: string;
    description: string;
    requiredResources: string[];
    requiredFeatures?: string[];
    sensitivity: ToolSensitivity;
    inputSchema: z.ZodSchema;
    execute: (
        args: unknown,
        context: AssistantUserContext,
    ) => Promise<ToolEvidence>;
};

// ---------------------------------------------------------------------------
// Authorization result
// ---------------------------------------------------------------------------

export type AuthorizationResult = {
    allowed: boolean;
    reason?: string;
    missingResources?: string[];
};

// ---------------------------------------------------------------------------
// Chat request / response (extended)
// ---------------------------------------------------------------------------

export type AssistantRequest = {
    question: string;
    conversationId?: string;
    pageContext?: {
        pathname?: string;
        entityType?: string;
        entityId?: string;
    };
};

export type CitedArticleForResponse = {
    slug: string;
    title: string;
    summary?: string;
    modules?: string[];
};

export type AssistantEvidenceChip = {
    source: ToolEvidenceSource;
    label: string;
    checkedAt: string;
    href?: string;
};

export type AssistantResponse = {
    answer: string;
    citations: string[];
    citedArticles?: CitedArticleForResponse[];
    relatedArticles?: CitedArticleForResponse[];
    evidence?: AssistantEvidenceChip[];
    conversationId?: string;
    needsClarification?: boolean;
    suggestions?: string[];
    confidence?: number;
    safety: {
        allowed: boolean;
        blockedReason?: string;
    };
};

// ---------------------------------------------------------------------------
// Legacy aliases (for backward compat during migration)
// ---------------------------------------------------------------------------

export type VirtualCsRequest = {
    question: string;
    channel: 'telegram' | 'web' | 'telegram_mini_app';
    requesterName?: string;
};

export type VirtualCsResponse = AssistantResponse;
