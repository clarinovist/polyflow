import { describe, expect, it, vi } from 'vitest';
import { collectLearningObservations } from '../learning-source';
import type { Prisma } from '@prisma/client';

describe('learning source privacy and provenance', () => {
    it('only returns allowlisted scalar counts, excludes raw columns and blocked outcomes', async () => {
        const query = vi.fn().mockResolvedValueOnce([{ mobileFailed: BigInt(3), mobileTotal: BigInt(20), unmapped: BigInt(2), views: BigInt(50) }]).mockResolvedValueOnce([{ failed: BigInt(4), total: BigInt(30) }]);
        const output = await collectLearningObservations({ $queryRaw: query } as unknown as Prisma.TransactionClient, new Date('2026-10-01'), new Date('2026-10-02'));
        expect(output).toEqual([{ metricKey: 'help_failure_share', numerator: 4, denominator: 30 }, { metricKey: 'mobile_failure_share', numerator: 3, denominator: 20 }, { metricKey: 'unmapped_view_share', numerator: 2, denominator: 50 }]);
        const sql = query.mock.calls.map(call => call[0].strings.join('?')).join('\n');
        for (const column of ['metadata', 'userId', 'tenantId', 'question', 'answerPreview', 'feedback', 'sessionId']) expect(sql).not.toContain(`"${column}"`);
        expect(sql).toContain("'SUCCESS','FAILED','PARTIAL'");
        expect(sql).not.toContain('BLOCKED');
        expect(sql).toContain('"createdAt" <');
    });
    it('rejects corrupt or overflowing aggregate counts rather than persisting misleading values', async () => {
        const query = vi.fn().mockResolvedValueOnce([{ mobileFailed: BigInt(30), mobileTotal: BigInt(20), unmapped: BigInt(0), views: BigInt(0) }]).mockResolvedValueOnce([{ failed: BigInt(0), total: BigInt(0) }]);
        await expect(collectLearningObservations({ $queryRaw: query } as unknown as Prisma.TransactionClient, new Date(), new Date())).rejects.toThrow();
    });
});
