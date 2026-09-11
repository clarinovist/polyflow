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

type ToolEvidenceSource =
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

export type CitedArticleForResponse = {
    slug: string;
    title: string;
    summary?: string;
    modules?: string[];
};

type AssistantEvidenceChip = {
    source: ToolEvidenceSource;
    label: string;
    checkedAt: string;
    href?: string;
};

export type AssistantDisposition =
    | 'RESOLVED'
    | 'NEEDS_CLARIFICATION'
    | 'ESCALATE';

export type AssistantResponse = {
    answer: string;
    citations: string[];
    citedArticles?: CitedArticleForResponse[];
    relatedArticles?: CitedArticleForResponse[];
    evidence?: AssistantEvidenceChip[];
    conversationId?: string;
    /** False means the visible answer could not be persisted. */
    historySaved?: boolean;
    /** Transport status, added by verified web routes after audit persistence. */
    bugReportNotice?: string;
    needsClarification?: boolean;
    suggestions?: string[];
    confidence?: number;
    /** Server-derived resolution signal; never accepted from client input. */
    disposition?: AssistantDisposition;
    safety: {
        allowed: boolean;
        blockedReason?: string;
    };
};

// ---------------------------------------------------------------------------
// Streaming events (SSE) — emitted while the agentic loop runs
// ---------------------------------------------------------------------------

export type AssistantSessionUserInput = {
    id?: string;
    name?: string | null;
    role?: string;
    roles?: string[];
    isSuperAdmin?: boolean;
    allowedResources?: string[] | 'ALL';
};

export type AssistantRequestContext = {
    tenantId?: string;
    sessionUser?: AssistantSessionUserInput;
    conversationId?: string;
    /** Already validated against the active tenant DB for web routes. */
    permissionsVerified?: boolean;
    workContext?: { pathname: string };
    onEvent?: (event: AssistantStreamEvent) => void;
};

export type AssistantStreamEvent =
    | { type: 'tool'; name: string; label: string }
    | { type: 'delta'; text: string }
    | { type: 'done'; data: AssistantResponse }
    | { type: 'error'; message: string };
