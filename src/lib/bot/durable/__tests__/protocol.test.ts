import { describe, expect, it } from 'vitest';
import {
    assistantAuthoritySchema,
    assistantSubmissionEnvelopeSchema,
    workerErrorStatus,
} from '../protocol';
import { verifyAssistantServiceAuthorization } from '../service-auth';

const requestId = '11111111-1111-4111-8111-111111111111';

describe('durable assistant protocol', () => {
    it('accepts only minimum server-authenticated envelope fields', () => {
        const result = assistantSubmissionEnvelopeSchema.safeParse({
            protocolVersion: 1,
            requestId,
            tenantId: 'tenant-opaque',
            userId: 'user-opaque',
            channel: 'web',
            question: 'cek stok',
            workContext: { pathname: '/warehouse/inventory' },
            role: 'ADMIN',
            allowedResources: 'ALL',
            dbUrl: 'postgresql://must-not-pass',
        });
        expect(result.success).toBe(true);
        expect(result.success && result.data).not.toHaveProperty('role');
        expect(result.success && result.data).not.toHaveProperty('dbUrl');
    });

    it('rejects malformed ids and unsafe authority paths', () => {
        expect(
            assistantSubmissionEnvelopeSchema.safeParse({
                protocolVersion: 1,
                requestId: 'not-uuid',
                tenantId: 't',
                userId: 'u',
                channel: 'web',
                question: 'q',
                workContext: { pathname: '/' },
            }).success,
        ).toBe(false);
        expect(
            assistantAuthoritySchema.safeParse({
                schemaVersion: 1,
                publicConversationId: 'c',
                tenantId: 't',
                userId: 'u',
                channel: 'web',
                accessScopeHash: 'a'.repeat(64),
                workContextKey: 'general:/',
                pathname: '//evil',
                profile: 'general',
            }).success,
        ).toBe(false);
    });

    it('uses constant-time service auth semantics and stable error statuses', () => {
        const token = 'x'.repeat(32);
        expect(verifyAssistantServiceAuthorization(`Bearer ${token}`, token)).toBe(true);
        expect(verifyAssistantServiceAuthorization('Bearer short', token)).toBe(false);
        expect(verifyAssistantServiceAuthorization(undefined, token)).toBe(false);
        expect(workerErrorStatus('CONTEXT_MISMATCH')).toBe(403);
        expect(workerErrorStatus('UNAVAILABLE')).toBe(503);
    });
});
