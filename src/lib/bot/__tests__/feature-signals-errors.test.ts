import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUniqueMock, loggerError } = vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    loggerError: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        featureSignalCluster: { findUnique: findUniqueMock },
    }),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: loggerError },
}));

import { upsertFeatureSignal } from '../feature-signals';

describe('upsertFeatureSignal — failure visibility', () => {
    beforeEach(() => {
        findUniqueMock.mockReset();
        loggerError.mockClear();
    });

    it('logs the error instead of swallowing it when the database fails', async () => {
        // Arrange
        findUniqueMock.mockRejectedValue(new Error('relation does not exist'));

        // Act
        const result = await upsertFeatureSignal({
            question: 'Tolong tambahkan fitur laporan umur piutang',
            redactedSample: 'Tolong tambahkan fitur laporan umur piutang',
            userId: 'user-1',
            tenantId: 'tenant-a',
        });

        // Assert
        expect(result).toBeNull();
        expect(loggerError).toHaveBeenCalledTimes(1);
        expect(loggerError.mock.calls[0][0]).toContain('feature signal');
    });
});
