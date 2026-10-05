import { describe, it, expect, vi } from 'vitest';
import { buildTemplateDraft } from '../feature-draft';
import { upsertFeatureSignal } from '../feature-signals';

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: vi.fn(),
}));

import { getMainPrisma } from '@/lib/core/prisma';

describe('buildTemplateDraft', () => {
    it('builds title, problem and evidence from cluster', () => {
        const d = buildTemplateDraft({
            canonicalRequest: 'Tambah tombol export excel di rekap piutang',
            sampleRequests: ['a', 'b'],
            uniqueUsers: 3,
            tenantIds: ['t1'],
            suggestedModule: 'finance',
        });
        expect(d.title).toContain('export excel');
        expect(d.problemMd).toContain('3 user');
        expect(d.impactedModules).toEqual(['finance']);
        expect(d.evidenceMd).toContain('- a');
    });
});

describe('upsertFeatureSignal threshold', () => {
    it('creates a proposal draft on reaching 3 unique users (LLM fallback to template)', async () => {
        const created: Array<Record<string, unknown>> = [];
        vi.mocked(getMainPrisma).mockReturnValue({
            featureSignalCluster: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'c1',
                    canonicalRequest: 'x',
                    uniqueUsers: 2,
                    sampleUserIds: ['u1', 'u2'],
                    tenantIds: ['t1'],
                    sampleRequests: ['s1'],
                    suggestedModule: 'sales',
                    status: 'OPEN',
                }),
                update: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
                    id: 'c1',
                    ...args.data,
                    sampleRequests: ['s2', 's1'],
                    tenantIds: ['t1'],
                    suggestedModule: 'sales',
                    status: 'OPEN',
                    canonicalRequest: 'Tambah tombol export',
                })),
            },
            featureProposal: {
                create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => { created.push(args.data); return { id: 'p1', ...args.data }; }),
            },
        } as never);

        const res = await upsertFeatureSignal({ question: 'Tolong tambahkan tombol export excel', redactedSample: 's2', userId: 'u3', tenantId: 't1' }) as unknown as Record<string, unknown>;
        expect(res['uniqueUsers']).toBe(3);
        expect(created).toHaveLength(1);
        expect(created[0]['status']).toBe('PENDING_REVIEW');
        expect(String(created[0]['problemMd'])).toContain('3 user');
    });
});
