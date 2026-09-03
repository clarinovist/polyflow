import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/core/prisma';
import { recordPerformanceSample } from '../performance-sample';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        performanceMetric: {
            create: vi.fn().mockResolvedValue({}),
        },
    },
}));

const loggerError = vi.fn();
vi.mock('@/lib/config/logger', () => ({
    logger: {
        error: (...args: unknown[]) => loggerError(...args),
    },
}));

describe('recordPerformanceSample', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.performanceMetric.create).mockResolvedValue(
            {} as never,
        );
    });

    it('records one sample with the given route and a non-negative integer duration', () => {
        recordPerformanceSample('balance-sheet', performance.now(), 'finance');

        expect(prisma.performanceMetric.create).toHaveBeenCalledTimes(1);
        const call = vi.mocked(prisma.performanceMetric.create).mock
            .calls[0][0] as { data: { route: string; durationMs: number } };
        expect(call.data.route).toBe('balance-sheet');
        expect(call.data.durationMs).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(call.data.durationMs)).toBe(true);
    });

    it('measures elapsed time from the supplied start marker', () => {
        const startedAt = performance.now() - 50;

        recordPerformanceSample('trial-balance', startedAt, 'finance');

        const call = vi.mocked(prisma.performanceMetric.create).mock
            .calls[0][0] as { data: { durationMs: number } };
        expect(call.data.durationMs).toBeGreaterThanOrEqual(40);
    });

    it('returns synchronously without awaiting the write (fire-and-forget)', () => {
        let resolveWrite: (value: unknown) => void = () => {};
        vi.mocked(prisma.performanceMetric.create).mockReturnValue(
            new Promise((resolve) => {
                resolveWrite = resolve;
            }) as never,
        );

        // Must not hang even though the write never settles during this tick.
        expect(() =>
            recordPerformanceSample(
                'income-statement',
                performance.now(),
                'finance',
            ),
        ).not.toThrow();

        resolveWrite({});
    });

    it('swallows a rejected write into the logger instead of throwing', async () => {
        vi.mocked(prisma.performanceMetric.create).mockRejectedValueOnce(
            new Error('db unreachable'),
        );

        expect(() =>
            recordPerformanceSample(
                'general-ledger-summary',
                performance.now(),
                'finance',
            ),
        ).not.toThrow();

        // Let the rejection handler run.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(loggerError).toHaveBeenCalledWith(
            'Failed to record performance metric',
            expect.objectContaining({
                module: 'finance',
                route: 'general-ledger-summary',
            }),
        );
    });
});
