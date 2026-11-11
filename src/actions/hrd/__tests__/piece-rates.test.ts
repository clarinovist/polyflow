import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    listProcessPieceRates,
    upsertProcessPieceRate,
} from '../piece-rates';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from '@/lib/tools/audit';

const mocks = vi.hoisted(() => {
    const tx = {
        processPieceRate: { findUnique: vi.fn(), upsert: vi.fn() },
    };
    return {
        tx,
        findMany: vi.fn(),
        transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
});

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        processPieceRate: { findMany: mocks.findMany },
        $transaction: mocks.transaction,
    },
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@prisma/client', () => ({
    MachineType: { EXTRUDER: 'EXTRUDER', SEALER: 'SEALER' },
}));

const DENIED_ROLES = ['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'];

const sessionFor = (role: string) =>
    ({ user: { id: 'user-1', role, tenantId: 'acme' } }) as never;

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

const input = { machineType: 'EXTRUDER' as never, ratePerKg: 150 };

function expectNothingTouched() {
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tx.processPieceRate.upsert).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
}

describe('piece-rates actions — akses HRD', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.findMany.mockResolvedValue([]);
        mocks.tx.processPieceRate.findUnique.mockResolvedValue({
            id: 'pr-1',
            machineType: 'EXTRUDER',
            ratePerKg: 100,
            status: 'ACTIVE',
        });
        mocks.tx.processPieceRate.upsert.mockResolvedValue({
            id: 'pr-1',
            machineType: 'EXTRUDER',
            ratePerKg: 150,
            status: 'ACTIVE',
        });
    });

    describe('listProcessPieceRates', () => {
        it.each(DENIED_ROLES)('menolak peran %s', async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = await listProcessPieceRates();

            expect(res.success).toBe(false);
            expectNothingTouched();
        });

        it('melempar ulang redirect login tanpa sesi', async () => {
            vi.mocked(requireAuth).mockRejectedValue(redirectError());

            await expect(listProcessPieceRates()).rejects.toThrow(
                'NEXT_REDIRECT',
            );
            expectNothingTouched();
        });

        it.each(['ADMIN', 'FINANCE', 'HRD'])('menerima peran %s', async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = await listProcessPieceRates();

            expect(res.success).toBe(true);
            expect(mocks.findMany).toHaveBeenCalledTimes(1);
        });
    });

    describe('upsertProcessPieceRate', () => {
        it.each([...DENIED_ROLES, 'FINANCE'])('menolak peran %s', async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = await upsertProcessPieceRate(input);

            expect(res.success).toBe(false);
            expectNothingTouched();
        });

        it('melempar ulang redirect login tanpa sesi', async () => {
            vi.mocked(requireAuth).mockRejectedValue(redirectError());

            await expect(upsertProcessPieceRate(input)).rejects.toThrow(
                'NEXT_REDIRECT',
            );
            expectNothingTouched();
        });

        it.each(['ADMIN', 'HRD'])('menerima peran %s', async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = await upsertProcessPieceRate(input);

            expect(res).toEqual({
                success: true,
                data: {
                    id: 'pr-1',
                    machineType: 'EXTRUDER',
                    ratePerKg: 150,
                    status: 'ACTIVE',
                },
            });
        });

        it('mencatat audit rate lama ke baru di dalam transaksi', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));

            await upsertProcessPieceRate(input);

            expect(logActivity).toHaveBeenCalledTimes(1);
            const params = vi.mocked(logActivity).mock.calls[0][0];
            expect(params).toMatchObject({
                userId: 'user-1',
                action: 'PIECE_RATE_UPSERTED',
                entityType: 'ProcessPieceRate',
                entityId: 'pr-1',
                tx: mocks.tx,
            });
            expect(params.details).toContain('EXTRUDER');
            expect(params.changes).toMatchObject({
                ratePerKg: { from: 100, to: 150 },
            });
        });

        it('mencatat rate lama null saat tarif belum ada', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('ADMIN'));
            mocks.tx.processPieceRate.findUnique.mockResolvedValue(null);

            await upsertProcessPieceRate(input);

            expect(vi.mocked(logActivity).mock.calls[0][0].changes).toMatchObject(
                { ratePerKg: { from: null, to: 150 } },
            );
        });

        it('tetap menolak rate negatif tanpa menyentuh data', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));

            const res = await upsertProcessPieceRate({
                ...input,
                ratePerKg: -1,
            });

            expect(res.success).toBe(false);
            expect(mocks.tx.processPieceRate.upsert).not.toHaveBeenCalled();
            expect(logActivity).not.toHaveBeenCalled();
        });

        it('tetap menolak tipe mesin tidak valid', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));

            const res = await upsertProcessPieceRate({
                machineType: 'BOGUS' as never,
                ratePerKg: 10,
            });

            expect(res.success).toBe(false);
            expect(mocks.tx.processPieceRate.upsert).not.toHaveBeenCalled();
        });
    });
});
