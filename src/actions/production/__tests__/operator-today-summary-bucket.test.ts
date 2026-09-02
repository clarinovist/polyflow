import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '@/auth';
import { requireAuth } from '@/lib/tools/auth-checks';
import { getOperatorTodaySummary } from '../production-execution';
import { prisma } from '@/lib/core/prisma';

// Regression 2026-09-02 (plan opsi C3): getOperatorTodaySummary harus bucket
// per startTime (konsisten dengan backdate shift-aware 644c569d), BUKAN
// createdAt. Entri shift malam yang di-backdate (startTime = shiftStart
// kemarin, createdAt dini hari hari ini) harus dihitung di tanggal shift.

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionExecution: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

const SESSION = { user: { id: 'user-1' } };

describe('getOperatorTodaySummary — shift-aware bucket (regresi)', () => {
    beforeEach(() => {
        vi.mocked(auth).mockResolvedValue(SESSION as never);
        vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-02T00:30:00.000+07:00'));
        vi.mocked(prisma.productionExecution.count).mockResolvedValue(0);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('filters executions by START time of the WIB day, not createdAt', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(
            [] as never,
        );

        await getOperatorTodaySummary('op-1');

        const call = vi.mocked(prisma.productionExecution.findMany).mock
            .calls[0]?.[0] as { where: Record<string, unknown> } | undefined;
        expect(call).toBeDefined();
        const where = call!.where;
        // startTime wajib jadi key filter — createdAt tidak boleh lagi
        expect(where.startTime).toEqual({
            gte: new Date('2026-09-01T17:00:00.000Z'), // 2 Sep 00:00 WIB
            lte: new Date('2026-09-02T16:59:59.999Z'), // 2 Sep 23:59:59.999 WIB
        });
        expect(where.createdAt).toBeUndefined();
    });

    it('backdated entry (startTime = shift kemarin 20:00 WIB, createdAt dini hari) jatuh DI LUAR window hari ini', () => {
        // Window "hari ini" (2 Sep WIB)
        const gte = new Date('2026-09-01T17:00:00.000Z').getTime();
        const lte = new Date('2026-09-02T16:59:59.999Z').getTime();

        // Entri backdated khas shift malam: startTime = shiftStart 1 Sep 20:00 WIB
        const backdatedStart = new Date('2026-09-01T13:00:00.000Z').getTime();
        expect(backdatedStart < gte).toBe(true); // → masuk bucket 1 Sep, bukan "hari ini"

        // Entri pagi hari ini (08:44 WIB 2 Sep) tetap di dalam window
        const morningStart = new Date('2026-09-02T01:44:20.000Z').getTime();
        expect(morningStart >= gte && morningStart <= lte).toBe(true);
    });
});
