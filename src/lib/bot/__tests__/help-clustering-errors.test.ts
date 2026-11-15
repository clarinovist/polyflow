import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUniqueMock, loggerError } = vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    loggerError: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        helpQuestionCluster: { findUnique: findUniqueMock },
    }),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: loggerError },
}));

import { upsertCluster } from '../help-clustering';

describe('upsertCluster — failure visibility', () => {
    beforeEach(() => {
        findUniqueMock.mockReset();
        loggerError.mockClear();
    });

    it('logs the error instead of swallowing it when the database fails', async () => {
        findUniqueMock.mockRejectedValue(new Error('relation does not exist'));

        const result = await upsertCluster({
            question: 'Bagaimana cara input opname stok?',
            redactedSample: 'Bagaimana cara input opname stok?',
        });

        expect(result).toBeNull();
        expect(loggerError).toHaveBeenCalledTimes(1);
        expect(loggerError.mock.calls[0][0]).toContain('help question cluster');
    });
});
