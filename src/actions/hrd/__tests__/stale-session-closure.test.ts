import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    previewStaleSessionClosure,
    applyStaleSessionClosure,
} from '../stale-session-closure';
import { requireAuth } from '@/lib/tools/auth-checks';
import { previewClosure, applyClosure } from '@/services/hrd/stale-session-closure';
import { BusinessRuleError } from '@/lib/errors/errors';

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { marker: 'root-prisma' } }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
// requireHrdApprover asli dipakai (cek peran sungguhan); hanya sesi yang dipalsukan.
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/services/hrd/stale-session-closure', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/hrd/stale-session-closure')>()),
    previewClosure: vi.fn(),
    applyClosure: vi.fn(),
}));

const FINGERPRINT = 'f'.repeat(64);
const previewInput = { recordIds: ['rec-1', 'rec-2'], policy: 'SHIFT_END' as const };
const applyInput = { ...previewInput, fingerprint: FINGERPRINT };

const previewData = {
    policy: 'SHIFT_END',
    fingerprint: FINGERPRINT,
    generatedAt: '2026-11-11T03:00:00.000Z',
    rows: [],
    totals: { eligibleCount: 0, ineligibleCount: 2, earnings: 0 },
    byEmployee: [],
    byWeek: [],
};

function sessionWithRole(role: string) {
    vi.mocked(requireAuth).mockResolvedValue({
        user: { id: 'user-1', role, roles: [role] },
    } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    sessionWithRole('HRD');
    vi.mocked(previewClosure).mockResolvedValue(previewData as never);
    vi.mocked(applyClosure).mockResolvedValue({
        batchId: 'b1',
        closedCount: 2,
        skippedCount: 0,
        earningsAdded: 198000,
    });
});

describe('peran (requireHrdApprover asli)', () => {
    it.each(['SALES', 'FINANCE', 'WAREHOUSE'])(
        '%s ditolak untuk pratinjau dan terapkan, service tidak dipanggil',
        async (role) => {
            sessionWithRole(role);
            const preview = await previewStaleSessionClosure(previewInput);
            const apply = await applyStaleSessionClosure(applyInput);

            expect(preview).toMatchObject({ success: false });
            expect(apply).toMatchObject({ success: false });
            expect((preview as { error: string }).error).toMatch(/Unauthorized/);
            expect(previewClosure).not.toHaveBeenCalled();
            expect(applyClosure).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'HRD'])('%s lolos', async (role) => {
        sessionWithRole(role);
        const preview = await previewStaleSessionClosure(previewInput);
        const apply = await applyStaleSessionClosure(applyInput);
        expect(preview).toEqual({ success: true, data: previewData });
        expect(apply.success).toBe(true);
    });

    it('redirect autentikasi dilempar ulang, bukan ditelan', async () => {
        vi.mocked(requireAuth).mockRejectedValue(new Error('NEXT_REDIRECT'));
        await expect(previewStaleSessionClosure(previewInput)).rejects.toThrow('NEXT_REDIRECT');
        await expect(applyStaleSessionClosure(applyInput)).rejects.toThrow('NEXT_REDIRECT');
    });
});

describe('previewStaleSessionClosure', () => {
    it('memanggil service dengan prisma tenant, id, kebijakan dan waktu server', async () => {
        await previewStaleSessionClosure(previewInput);

        const [db, args] = vi.mocked(previewClosure).mock.calls[0];
        expect(db).toEqual({ marker: 'root-prisma' });
        expect(args.recordIds).toEqual(['rec-1', 'rec-2']);
        expect(args.policy).toBe('SHIFT_END');
        expect(args.now).toBeInstanceOf(Date);
    });

    it('error service dikembalikan sebagai success:false berbahasa Indonesia', async () => {
        vi.mocked(previewClosure).mockRejectedValue(new BusinessRuleError('Gagal contoh'));
        expect(await previewStaleSessionClosure(previewInput)).toMatchObject({
            success: false,
            error: 'Gagal contoh',
        });
    });

    it.each([
        [{ recordIds: [], policy: 'SHIFT_END' }, /minimal satu/i],
        [{ recordIds: ['a', 'a'], policy: 'SHIFT_END' }, /ganda/i],
        [{ recordIds: ['a'], policy: 'LAINNYA' }, /kebijakan/i],
        [null, /tidak valid/i],
    ])('input tidak valid ditolak sebelum service (%j)', async (input, message) => {
        const result = await previewStaleSessionClosure(input as never);
        expect(result).toMatchObject({ success: false });
        expect((result as { error: string }).error).toMatch(message);
        expect(previewClosure).not.toHaveBeenCalled();
    });
});

describe('applyStaleSessionClosure', () => {
    it('memanggil service dengan userId dari sesi, bukan dari klien, dan mengembalikan hasil kontrak', async () => {
        const result = await applyStaleSessionClosure({
            ...applyInput,
            userId: 'penyerang',
            clockOutAt: '2020-01-01T00:00:00Z',
        } as never);

        expect(result).toEqual({
            success: true,
            data: { batchId: 'b1', closedCount: 2, skippedCount: 0, earningsAdded: 198000 },
        });
        const [db, args] = vi.mocked(applyClosure).mock.calls[0];
        expect(db).toEqual({ marker: 'root-prisma' });
        expect(args).toMatchObject({
            recordIds: ['rec-1', 'rec-2'],
            policy: 'SHIFT_END',
            fingerprint: FINGERPRINT,
            userId: 'user-1',
        });
        expect(args).not.toHaveProperty('clockOutAt');
    });

    it('error "data berubah" dari service diteruskan apa adanya', async () => {
        vi.mocked(applyClosure).mockRejectedValue(
            new BusinessRuleError('Data berubah sejak pratinjau, buat pratinjau ulang'),
        );
        expect(await applyStaleSessionClosure(applyInput)).toMatchObject({
            success: false,
            error: 'Data berubah sejak pratinjau, buat pratinjau ulang',
        });
    });

    it.each([
        [{ ...applyInput, fingerprint: undefined }, /pratinjau/i],
        [{ ...applyInput, fingerprint: 'bukan-hex' }, /pratinjau/i],
        [{ ...applyInput, recordIds: [] }, /minimal satu/i],
        [{ ...applyInput, recordIds: Array.from({ length: 201 }, (_, i) => `r${i}`) }, /maksimal 200/i],
        [{ ...applyInput, policy: 'X' }, /kebijakan/i],
    ])('input tidak valid ditolak sebelum service (%#)', async (input, message) => {
        const result = await applyStaleSessionClosure(input as never);
        expect(result).toMatchObject({ success: false });
        expect((result as { error: string }).error).toMatch(message);
        expect(applyClosure).not.toHaveBeenCalled();
    });
});
