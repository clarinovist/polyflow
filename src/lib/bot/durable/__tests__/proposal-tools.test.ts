import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError } from '@/lib/errors/errors';

vi.mock('@/services/assistant/action-proposal-service', () => ({
    COLLECTION_FOLLOWUP_KIND: 'COLLECTION_FOLLOWUP',
    PROPOSAL_TTL_MS: 900_000,
    createCollectionFollowupProposal: vi.fn(),
}));
vi.mock('@/services/assistant/invoice-access', () => ({
    buildInvoiceAccessGuard: vi.fn(() => vi.fn()),
}));

import { createCollectionFollowupProposal } from '@/services/assistant/action-proposal-service';
import {
    getProposalToolByName,
    proposeCollectionFollowupTool,
    PROPOSE_COLLECTION_FOLLOWUP_TOOL,
} from '../proposal-tools';
import { getToolByName } from '../../tool-registry';

const create = vi.mocked(createCollectionFollowupProposal);
const input = {
    context: {
        userId: 'u1',
        roles: ['SALES'],
        allowedResources: 'ALL' as const,
        tenantId: 't1',
        channel: 'web' as const,
        locale: 'id',
    },
    authority: {
        schemaVersion: 1,
        publicConversationId: 'c1',
        tenantId: 't1',
        userId: 'u1',
        channel: 'web',
        accessScopeHash: 'a'.repeat(64),
        workContextKey: 'k',
        pathname: '/sales',
        profile: 'general',
    } as never,
};

beforeEach(() => vi.clearAllMocks());

describe('proposal tools', () => {
    it('is never part of the read-only toolRegistry', () => {
        expect(getToolByName(PROPOSE_COLLECTION_FOLLOWUP_TOOL)).toBeUndefined();
        expect(getProposalToolByName(PROPOSE_COLLECTION_FOLLOWUP_TOOL)).toBe(
            proposeCollectionFollowupTool,
        );
    });

    it('rejects unknown arguments (strict schema)', () => {
        const parsed = proposeCollectionFollowupTool.inputSchema.safeParse({
            invoiceId: 'i1',
            type: 'CALL',
            status: 'PAID',
        });
        expect(parsed.success).toBe(false);
    });

    it('binds tenant, user and conversation from authority, not from arguments', async () => {
        create.mockResolvedValue({ id: 'p1', status: 'PENDING' } as never);
        const evidence = await proposeCollectionFollowupTool.execute(
            { invoiceId: 'i1', type: 'CALL' },
            input,
        );
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 't1',
                userId: 'u1',
                conversationId: 'c1',
            }),
        );
        expect(evidence.summary).toMatch(/MENUNGGU konfirmasi/);
        expect(evidence.summary).toMatch(/Belum ada data yang diubah/);
        expect(evidence.entities?.[0]?.id).toBe('p1');
    });

    it('turns domain validation errors into partial evidence, not a crash', async () => {
        create.mockRejectedValue(new ValidationError('promisedDate wajib'));
        const evidence = await proposeCollectionFollowupTool.execute(
            { invoiceId: 'i1', type: 'PROMISE_TO_PAY' },
            input,
        );
        expect(evidence.completeness).toBe('partial');
        expect(evidence.summary).toMatch(/tidak dibuat/);
    });

    it('rethrows unexpected errors so the broker audits ERROR', async () => {
        create.mockRejectedValue(new Error('db down'));
        await expect(
            proposeCollectionFollowupTool.execute(
                { invoiceId: 'i1', type: 'CALL' },
                input,
            ),
        ).rejects.toThrow('db down');
    });
});
