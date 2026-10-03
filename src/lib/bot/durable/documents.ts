import {
    defineDoc,
    defineEntry,
    type JsonObject,
} from '@earendil-works/pi-durable';
import type { AssistantAuthority } from './protocol';
import type { AssistantResponse, ToolEvidence } from '../assistant-types';

export type AuthorityDocument = AssistantAuthority & JsonObject;
export const AuthorityDoc = defineDoc<AuthorityDocument>({
    kind: 'polyflow.authority',
    version: 1,
    scope: 'conversation',
    history: 'latest',
    fork: 'initial',
    initial: () => ({
        schemaVersion: 1,
        publicConversationId: '',
        tenantId: '',
        userId: '',
        channel: 'web',
        accessScopeHash: '',
        workContextKey: '',
        pathname: '/',
        profile: 'general',
    }),
});

export type IntentDocument = JsonObject & {
    status: 'completed' | 'unavailable';
    route?: string;
    routeConfidence?: number;
    needsClarification?: number;
    deterministicIntent?: string;
};
export const IntentDoc = defineDoc<IntentDocument>({
    kind: 'polyflow.intent',
    version: 1,
    scope: 'conversation',
    history: 'latest',
    fork: 'initial',
    initial: () => ({ status: 'unavailable' }),
});

export type PresentationDocument = JsonObject & {
    requestId: string;
    response: AssistantResponse & JsonObject;
    projected: boolean;
    interactionId?: string;
};
export const PresentationDoc = defineDoc<PresentationDocument>({
    kind: 'polyflow.presentation',
    version: 1,
    scope: 'conversation',
    history: 'latest',
    fork: 'initial',
    initial: () => ({
        requestId: '',
        response: { answer: '', citations: [], safety: { allowed: true } },
        projected: false,
    }),
});

export type ToolEvidenceDetail = JsonObject & {
    evidence: (ToolEvidence & JsonObject) | null;
    authorization: 'allowed' | 'denied';
    executionKey: string;
};

export const PresentationEntry = defineEntry<{
    requestId: string;
    response: AssistantResponse & JsonObject;
}>('polyflow.presentation');
