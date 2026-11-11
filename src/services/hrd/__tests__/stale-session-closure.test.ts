import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logActivity } from '@/lib/tools/audit';
import { CLOSURE_MAX_BATCH } from '@/lib/hrd/stale-session-closure-constants';
import {
    previewClosure,
    applyClosure,
    parseClosureInput,
    parseClosureFingerprint,
} from '../stale-session-closure';
import {
    NOW,
    SHIFT_NIGHT,
    createFakeDb,
    makeRecord,
    type FakeRow,
} from './stale-session-closure-fixtures';

vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STALE_DATA = 'Data berubah sejak pratinjau, buat pratinjau ulang';

function three(): FakeRow[] {
    return [
        makeRecord({ id: 'rec-1' }),
        makeRecord({ id: 'rec-2', employeeId: 'emp-2', employee: { name: 'Dua', code: 'E002', payType: 'DAILY' } }),
        makeRecord({ id: 'rec-3', employeeId: 'emp-3', employee: { name: 'Tiga', code: 'E003', payType: 'DAILY' } }),
    ];
}

const IDS = ['rec-1', 'rec-2', 'rec-3'];

beforeEach(() => {
    vi.mocked(logActivity).mockReset();
    vi.mocked(logActivity).mockResolvedValue(undefined);
});

describe('previewClosure', () => {
    it('menghitung jam pulang usulan, jam kerja dan upah per baris (SHIFT_END)', async () => {
        const fake = createFakeDb([makeRecord()]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: ['rec-1'],
            policy: 'SHIFT_END',
            now: NOW,
        });

        expect(preview.policy).toBe('SHIFT_END');
        expect(preview.generatedAt).toBe(NOW.toISOString());
        expect(preview.rows).toHaveLength(1);
        expect(preview.rows[0]).toMatchObject({
            id: 'rec-1',
            employeeId: 'emp-1',
            employeeName: 'Karyawan Contoh',
            employeeCode: 'E001',
            workDate: '2026-11-09',
            weekStart: '2026-11-09',
            shiftName: 'Shift Pagi',
            clockInAt: '2026-11-09T01:05:00.000Z',
            proposedClockOutAt: '2026-11-09T09:00:00.000Z',
            actualHours: 7.92,
            regularHours: 7.92,
            overtimeHours: 0,
            earnings: 99000,
            eligible: true,
        });
        expect(preview.rows[0].reason).toBeUndefined();
        expect(preview.totals).toEqual({ eligibleCount: 1, ineligibleCount: 0, earnings: 99000 });
    });

    it('kebijakan CLOCK_IN_PLUS_PLANNED: jam masuk + durasi terjadwal, lembur 0', async () => {
        const fake = createFakeDb([makeRecord()]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: ['rec-1'],
            policy: 'CLOCK_IN_PLUS_PLANNED',
            now: NOW,
        });
        expect(preview.rows[0]).toMatchObject({
            proposedClockOutAt: '2026-11-09T09:05:00.000Z',
            actualHours: 8,
            regularHours: 8,
            overtimeHours: 0,
            earnings: 100000,
            eligible: true,
        });
    });

    it('subtotal per karyawan dan per minggu (Senin) hanya menghitung baris layak', async () => {
        const fake = createFakeDb([
            makeRecord({ id: 'rec-1' }),
            makeRecord({
                id: 'rec-2',
                workDate: new Date('2026-11-08T00:00:00.000Z'), // Minggu -> minggu Senin 2 Nov
                clockInAt: new Date('2026-11-08T01:05:00.000Z'),
            }),
            makeRecord({ id: 'rec-3', employeeId: 'emp-2', clockOutAt: new Date('2026-11-09T09:00:00.000Z') }),
        ]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: IDS,
            policy: 'SHIFT_END',
            now: NOW,
        });

        expect(preview.totals).toEqual({ eligibleCount: 2, ineligibleCount: 1, earnings: 198000 });
        expect(preview.byEmployee).toEqual([
            { employeeId: 'emp-1', employeeName: 'Karyawan Contoh', eligibleCount: 2, earnings: 198000 },
        ]);
        expect(preview.byWeek).toEqual([
            { weekStart: '2026-11-02', eligibleCount: 1, earnings: 99000 },
            { weekStart: '2026-11-09', eligibleCount: 1, earnings: 99000 },
        ]);
    });

    it('memuat record dengan SATU query berdasarkan id (tanpa N+1) dan include karyawan + shift', async () => {
        const fake = createFakeDb(three());
        await previewClosure(fake.readDb as any, { recordIds: IDS, policy: 'SHIFT_END', now: NOW });

        expect(fake.tx.attendanceRecord.findMany).toHaveBeenCalledTimes(1);
        const arg = fake.tx.attendanceRecord.findMany.mock.calls[0][0] as FakeRow;
        expect(arg.where).toEqual({ id: { in: IDS } });
        expect(arg.include.workShift).toBe(true);
        expect(arg.include.employee.select).toMatchObject({ name: true, code: true, payType: true });
        expect(fake.tx.attendanceRecord.findUnique).not.toHaveBeenCalled();
    });

    it('tidak menulis apa pun (read-only)', async () => {
        const fake = createFakeDb(three());
        await previewClosure(fake.readDb as any, { recordIds: IDS, policy: 'SHIFT_END', now: NOW });

        expect(fake.tx.attendanceRecord.update).not.toHaveBeenCalled();
        expect(fake.tx.attendanceRecord.updateMany).not.toHaveBeenCalled();
        expect(fake.db.$transaction).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });

    it('baris tidak layak dengan alasan jelas: tidak ditemukan, sudah ditutup, bukan hadir, belum basi, di luar jendela 60 hari', async () => {
        const fake = createFakeDb([
            makeRecord({ id: 'closed', clockOutAt: new Date('2026-11-09T09:00:00.000Z') }),
            makeRecord({ id: 'absent', status: 'ABSENT', clockInAt: null }),
            makeRecord({
                id: 'fresh',
                workDate: new Date('2026-11-10T00:00:00.000Z'),
                clockInAt: new Date('2026-11-10T20:00:00.000Z'), // 7 jam sebelum NOW
            }),
            makeRecord({
                id: 'ancient',
                workDate: new Date('2026-08-01T00:00:00.000Z'),
                clockInAt: new Date('2026-08-01T01:00:00.000Z'),
            }),
        ]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: ['closed', 'absent', 'fresh', 'ancient', 'ghost'],
            policy: 'SHIFT_END',
            now: NOW,
        });

        const byId = Object.fromEntries(preview.rows.map((r) => [r.id, r]));
        expect(preview.rows.map((r) => r.id)).toEqual(['closed', 'absent', 'fresh', 'ancient', 'ghost']);
        for (const row of preview.rows) {
            expect(row.eligible).toBe(false);
            expect(row.proposedClockOutAt).toBeNull();
            expect(row.earnings).toBe(0);
            expect(row.reason).toBeTruthy();
        }
        expect(byId.closed.reason).toMatch(/sudah ditutup/i);
        expect(byId.absent.reason).toMatch(/bukan.*hadir|status/i);
        expect(byId.fresh.reason).toMatch(/20 jam/);
        expect(byId.ancient.reason).toMatch(/60 hari/);
        expect(byId.ghost.reason).toMatch(/tidak ditemukan/i);
        expect(preview.totals).toEqual({ eligibleCount: 0, ineligibleCount: 5, earnings: 0 });
        expect(preview.byEmployee).toEqual([]);
        expect(preview.byWeek).toEqual([]);
    });

    it('jam masuk melewati akhir shift -> tidak layak dengan alasan dari kebijakan', async () => {
        const fake = createFakeDb([
            makeRecord({ clockInAt: new Date('2026-11-09T10:00:00.000Z') }), // 17:00 WIB
        ]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: ['rec-1'],
            policy: 'SHIFT_END',
            now: NOW,
        });
        expect(preview.rows[0].eligible).toBe(false);
        expect(preview.rows[0].reason).toBe(
            'Jam masuk melewati akhir shift; tutup manual lewat Koreksi jam',
        );
    });

    it('jam pulang usulan di masa depan -> tidak layak', async () => {
        const fake = createFakeDb([
            makeRecord({
                workDate: new Date('2026-11-10T00:00:00.000Z'),
                clockInAt: new Date('2026-11-10T05:30:00.000Z'), // 21,5 jam sebelum NOW
                workShift: { ...SHIFT_NIGHT, startTime: '12:00', endTime: '11:00' },
            }),
        ]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: ['rec-1'],
            policy: 'SHIFT_END',
            now: NOW,
        });
        expect(preview.rows[0].eligible).toBe(false);
        expect(preview.rows[0].reason).toMatch(/belum tercapai/i);
    });

    it('peringatan bila tarif harian snapshot 0 atau karyawan PIECE; tetap layak', async () => {
        const fake = createFakeDb([
            makeRecord({ id: 'zero', dailyRateSnapshot: null }),
            makeRecord({
                id: 'piece',
                employee: { name: 'Borongan', code: 'E009', payType: 'PIECE' },
            }),
            makeRecord({ id: 'normal' }),
        ]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: ['zero', 'piece', 'normal'],
            policy: 'SHIFT_END',
            now: NOW,
        });
        const byId = Object.fromEntries(preview.rows.map((r) => [r.id, r]));
        expect(byId.zero.eligible).toBe(true);
        expect(byId.zero.warning).toBe('Tarif harian 0: upah tetap Rp0');
        expect(byId.zero.earnings).toBe(0);
        expect(byId.piece.eligible).toBe(true);
        expect(byId.piece.warning).toMatch(/borongan|PIECE/i);
        expect(byId.normal.warning).toBeUndefined();
    });

    it('fingerprint stabil untuk keadaan sama (tidak bergantung now) dan berubah bila record/kebijakan berubah', async () => {
        const fake = createFakeDb(three());
        const input = { recordIds: IDS, policy: 'SHIFT_END' as const };
        const a = await previewClosure(fake.readDb as any, { ...input, now: NOW });
        const later = await previewClosure(fake.readDb as any, {
            ...input,
            recordIds: [...IDS].reverse(),
            now: new Date(NOW.getTime() + 60_000),
        });
        expect(later.fingerprint).toBe(a.fingerprint);

        const otherPolicy = await previewClosure(fake.readDb as any, {
            ...input,
            policy: 'CLOCK_IN_PLUS_PLANNED',
            now: NOW,
        });
        expect(otherPolicy.fingerprint).not.toBe(a.fingerprint);

        fake.mutate('rec-2', { notes: 'diubah penulis lain' });
        const changed = await previewClosure(fake.readDb as any, { ...input, now: NOW });
        expect(changed.fingerprint).not.toBe(a.fingerprint);
    });

    it('menolak daftar id kosong dan di atas CLOSURE_MAX_BATCH', async () => {
        const fake = createFakeDb([]);
        await expect(
            previewClosure(fake.readDb as any, { recordIds: [], policy: 'SHIFT_END', now: NOW }),
        ).rejects.toThrow(/minimal satu/i);
        const tooMany = Array.from({ length: CLOSURE_MAX_BATCH + 1 }, (_, i) => `r-${i}`);
        await expect(
            previewClosure(fake.readDb as any, { recordIds: tooMany, policy: 'SHIFT_END', now: NOW }),
        ).rejects.toThrow(/maksimal 200/i);
        expect(fake.tx.attendanceRecord.findMany).not.toHaveBeenCalled();
    });
});

describe('applyClosure', () => {
    async function previewOf(fake: ReturnType<typeof createFakeDb>, ids = IDS) {
        return previewClosure(fake.readDb as any, { recordIds: ids, policy: 'SHIFT_END', now: NOW });
    }
    const applyInput = (fingerprint: string, ids = IDS) => ({
        recordIds: ids,
        policy: 'SHIFT_END' as const,
        fingerprint,
        userId: 'user-hrd',
        now: NOW,
    });

    it('menutup semua record layak dalam SATU transaksi dengan timeout bernama; db akar tidak ditulis', async () => {
        const fake = createFakeDb(three());
        const preview = await previewOf(fake);

        const result = await applyClosure(fake.db as any, applyInput(preview.fingerprint));

        expect(result.closedCount).toBe(3);
        expect(result.skippedCount).toBe(0);
        expect(result.earningsAdded).toBe(297000);
        expect(result.batchId).toMatch(UUID_RE);
        expect(fake.db.$transaction).toHaveBeenCalledTimes(1);
        expect(fake.db.$transaction.mock.calls[0][1]).toEqual({ timeout: 30_000 });
        for (const fn of Object.values(fake.rootGuard)) expect(fn).not.toHaveBeenCalled();
        for (const id of IDS) {
            expect(fake.get(id)!.clockOutAt).toEqual(new Date('2026-11-09T09:00:00.000Z'));
        }
    });

    it('klaim atomik per record memakai where id + PRESENT + clockIn not null + clockOut null (+ updatedAt yang dilihat)', async () => {
        const fake = createFakeDb(three());
        const preview = await previewOf(fake);
        await applyClosure(fake.db as any, applyInput(preview.fingerprint));

        expect(fake.tx.attendanceRecord.updateMany).toHaveBeenCalledTimes(3);
        expect(fake.tx.attendanceRecord.updateMany.mock.calls[0][0]).toEqual({
            where: {
                id: 'rec-1',
                status: 'PRESENT',
                clockInAt: { not: null },
                clockOutAt: null,
                updatedAt: new Date('2026-11-09T10:00:00.000Z'),
            },
            data: { clockOutAt: new Date('2026-11-09T09:00:00.000Z') },
        });
    });

    it('menulis kolom hitung (dua langkah seperti correct) tanpa mengubah jam masuk, tarif, status, shift, tanggal kerja', async () => {
        const fake = createFakeDb([makeRecord()]);
        const before = fake.get('rec-1')!;
        const preview = await previewOf(fake, ['rec-1']);
        await applyClosure(fake.db as any, applyInput(preview.fingerprint, ['rec-1']));

        const after = fake.get('rec-1')!;
        expect(Number(after.actualHours)).toBe(7.92);
        expect(Number(after.regularHours)).toBe(7.92);
        expect(Number(after.overtimeHours)).toBe(0);
        expect(Number(after.dailyEarnings)).toBe(99000);
        expect(Number(after.totalEarnings)).toBe(99000);
        for (const key of [
            'clockInAt',
            'dailyRateSnapshot',
            'overtimeRateSnapshot',
            'standardDayHours',
            'status',
            'workShiftId',
            'workDate',
            'employeeId',
        ]) {
            expect(after[key]).toEqual(before[key]);
        }
        // klaim -> baca ulang -> update kolom hitung
        const claimOrder = fake.tx.attendanceRecord.updateMany.mock.invocationCallOrder[0];
        const readOrder = fake.tx.attendanceRecord.findUnique.mock.invocationCallOrder[0];
        const writeOrder = fake.tx.attendanceRecord.update.mock.invocationCallOrder[0];
        expect(claimOrder).toBeLessThan(readOrder);
        expect(readOrder).toBeLessThan(writeOrder);
    });

    it('menambah penanda ke catatan tanpa menimpa catatan lama', async () => {
        const fake = createFakeDb([
            makeRecord({ id: 'rec-1', notes: 'Lupa tap pulang' }),
            makeRecord({ id: 'rec-2', employeeId: 'emp-2', notes: null }),
        ]);
        const ids = ['rec-1', 'rec-2'];
        const preview = await previewOf(fake, ids);
        const result = await applyClosure(fake.db as any, applyInput(preview.fingerprint, ids));

        const marker = `[Koreksi massal ${result.batchId}: jam pulang diasumsikan Akhir shift terjadwal]`;
        expect(fake.get('rec-1')!.notes).toBe(`Lupa tap pulang\n${marker}`);
        expect(fake.get('rec-2')!.notes).toBe(marker);
    });

    it('audit di dalam transaksi: satu entri per record + satu ringkasan batch, semua dengan tx', async () => {
        const fake = createFakeDb(three());
        const preview = await previewOf(fake);
        const result = await applyClosure(fake.db as any, applyInput(preview.fingerprint));

        const calls = vi.mocked(logActivity).mock.calls.map((c) => c[0]);
        expect(calls).toHaveLength(4);
        for (const call of calls) {
            expect(call.tx).toBe(fake.tx);
            expect(call.userId).toBe('user-hrd');
        }
        const perRecord = calls.slice(0, 3);
        expect(perRecord.map((c) => c.entityId)).toEqual(IDS);
        expect(perRecord[0]).toMatchObject({
            action: 'ATTENDANCE_BULK_CLOSED',
            entityType: 'AttendanceRecord',
            entityId: 'rec-1',
            changes: {
                clockOutAt: { from: null, to: '2026-11-09T09:00:00.000Z' },
                totalEarnings: { from: 0, to: 99000 },
            },
        });
        expect(perRecord[0].details).toContain(result.batchId);
        expect(perRecord[0].details).toContain('SHIFT_END');

        const summary = calls[3];
        expect(summary).toMatchObject({
            action: 'ATTENDANCE_BULK_CLOSURE_BATCH',
            entityType: 'AttendanceBulkClosure',
            entityId: result.batchId,
        });
        expect(summary.changes).toMatchObject({
            closedCount: 3,
            skippedCount: 0,
            totalEarnings: 297000,
            policy: 'SHIFT_END',
            recordIds: IDS,
        });
    });

    it('menolak bila fingerprint berbeda (data berubah) tanpa menulis apa pun', async () => {
        const fake = createFakeDb(three());
        const preview = await previewOf(fake);
        fake.mutate('rec-2', { notes: 'diubah penulis lain' });

        await expect(
            applyClosure(fake.db as any, applyInput(preview.fingerprint)),
        ).rejects.toThrow(STALE_DATA);
        expect(fake.tx.attendanceRecord.updateMany).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });

    it('menolak bila kebijakan berbeda dari yang dipratinjau', async () => {
        const fake = createFakeDb(three());
        const preview = await previewOf(fake);
        await expect(
            applyClosure(fake.db as any, {
                ...applyInput(preview.fingerprint),
                policy: 'CLOCK_IN_PLUS_PLANNED',
            }),
        ).rejects.toThrow(STALE_DATA);
    });

    it('klaim gagal (count 0) di record ke-3: seluruh batch batal, tidak ada tulis sebagian, tidak ada ringkasan', async () => {
        const fake = createFakeDb(three());
        const initial = fake.snapshot();
        const preview = await previewOf(fake);
        const original = fake.tx.attendanceRecord.updateMany.getMockImplementation()!;
        let call = 0;
        fake.tx.attendanceRecord.updateMany.mockImplementation(async (arg: any) =>
            ++call === 3 ? { count: 0 } : original(arg),
        );

        await expect(
            applyClosure(fake.db as any, applyInput(preview.fingerprint)),
        ).rejects.toThrow(/sudah berubah|ditutup/i);

        expect(fake.tx.attendanceRecord.updateMany).toHaveBeenCalledTimes(3);
        expect(fake.snapshot()).toEqual(initial); // keadaan dikembalikan (rollback)
        const actions = vi.mocked(logActivity).mock.calls.map((c) => c[0].action);
        expect(actions).not.toContain('ATTENDANCE_BULK_CLOSURE_BATCH');
        for (const fn of Object.values(fake.rootGuard)) expect(fn).not.toHaveBeenCalled();
    });

    it('audit per record gagal: seluruh transaksi batal', async () => {
        const fake = createFakeDb(three());
        const initial = fake.snapshot();
        const preview = await previewOf(fake);
        vi.mocked(logActivity)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('audit gagal'));

        await expect(
            applyClosure(fake.db as any, applyInput(preview.fingerprint)),
        ).rejects.toThrow('audit gagal');
        expect(fake.snapshot()).toEqual(initial);
        expect(fake.tx.attendanceRecord.updateMany).toHaveBeenCalledTimes(2);
    });

    it('audit ringkasan batch gagal: seluruh transaksi batal', async () => {
        const fake = createFakeDb(three());
        const initial = fake.snapshot();
        const preview = await previewOf(fake);
        vi.mocked(logActivity).mockImplementation(async (arg) => {
            if (arg.action === 'ATTENDANCE_BULK_CLOSURE_BATCH') throw new Error('ringkasan gagal');
        });

        await expect(
            applyClosure(fake.db as any, applyInput(preview.fingerprint)),
        ).rejects.toThrow('ringkasan gagal');
        expect(fake.snapshot()).toEqual(initial);
    });

    it('idempoten: eksekusi kedua dengan fingerprint yang sama ditolak dan tidak menulis ganda', async () => {
        const fake = createFakeDb(three());
        const preview = await previewOf(fake);
        await applyClosure(fake.db as any, applyInput(preview.fingerprint));
        const afterFirst = fake.snapshot();
        const claimsAfterFirst = fake.tx.attendanceRecord.updateMany.mock.calls.length;
        vi.mocked(logActivity).mockClear();

        await expect(
            applyClosure(fake.db as any, applyInput(preview.fingerprint)),
        ).rejects.toThrow(STALE_DATA);

        expect(fake.snapshot()).toEqual(afterFirst);
        expect(fake.tx.attendanceRecord.updateMany.mock.calls.length).toBe(claimsAfterFirst);
        expect(logActivity).not.toHaveBeenCalled();
    });

    it('balapan: fingerprint cocok tetapi klaim kalah (count 0) -> batal', async () => {
        const fake = createFakeDb([makeRecord()]);
        const initial = fake.snapshot();
        const preview = await previewOf(fake, ['rec-1']);
        fake.tx.attendanceRecord.updateMany.mockResolvedValueOnce({ count: 0 });

        await expect(
            applyClosure(fake.db as any, applyInput(preview.fingerprint, ['rec-1'])),
        ).rejects.toThrow(/sudah berubah|ditutup/i);
        expect(fake.snapshot()).toEqual(initial);
        expect(fake.tx.attendanceRecord.update).not.toHaveBeenCalled();
    });

    it('hanya baris layak yang diproses; sisanya dihitung sebagai dilewati', async () => {
        const fake = createFakeDb([
            makeRecord({ id: 'ok' }),
            makeRecord({ id: 'closed', clockOutAt: new Date('2026-11-09T09:00:00.000Z') }),
            makeRecord({
                id: 'fresh',
                workDate: new Date('2026-11-10T00:00:00.000Z'),
                clockInAt: new Date('2026-11-10T20:00:00.000Z'),
            }),
        ]);
        const ids = ['ok', 'closed', 'fresh', 'ghost'];
        const initialClosed = fake.get('closed');
        const initialFresh = fake.get('fresh');
        const preview = await previewOf(fake, ids);

        const result = await applyClosure(fake.db as any, applyInput(preview.fingerprint, ids));

        expect(result).toMatchObject({ closedCount: 1, skippedCount: 3, earningsAdded: 99000 });
        expect(fake.tx.attendanceRecord.updateMany).toHaveBeenCalledTimes(1);
        expect(fake.get('closed')).toEqual(initialClosed);
        expect(fake.get('fresh')).toEqual(initialFresh);
        expect(vi.mocked(logActivity).mock.calls).toHaveLength(2); // 1 record + ringkasan
    });

    it('menolak bila tidak ada baris layak (tanpa ringkasan audit kosong)', async () => {
        const fake = createFakeDb([
            makeRecord({ id: 'closed', clockOutAt: new Date('2026-11-09T09:00:00.000Z') }),
        ]);
        const preview = await previewOf(fake, ['closed']);
        await expect(
            applyClosure(fake.db as any, applyInput(preview.fingerprint, ['closed'])),
        ).rejects.toThrow(/tidak ada sesi yang layak/i);
        expect(logActivity).not.toHaveBeenCalled();
    });

    it('fingerprint dibandingkan pada waktu apply berbeda (generatedAt/now tidak ikut)', async () => {
        const fake = createFakeDb(three());
        const preview = await previewOf(fake);
        const result = await applyClosure(fake.db as any, {
            ...applyInput(preview.fingerprint),
            now: new Date(NOW.getTime() + 5 * 60_000),
        });
        expect(result.closedCount).toBe(3);
    });

    it('menolak daftar kosong dan di atas batas tanpa membuka transaksi', async () => {
        const fake = createFakeDb([]);
        await expect(
            applyClosure(fake.db as any, applyInput('a'.repeat(64), [])),
        ).rejects.toThrow(/minimal satu/i);
        const tooMany = Array.from({ length: CLOSURE_MAX_BATCH + 1 }, (_, i) => `r-${i}`);
        await expect(
            applyClosure(fake.db as any, applyInput('a'.repeat(64), tooMany)),
        ).rejects.toThrow(/maksimal 200/i);
        expect(fake.db.$transaction).not.toHaveBeenCalled();
    });

    it('batas tepat 200 id diterima (tervalidasi sebelum query)', async () => {
        const fake = createFakeDb([]);
        const exactly = Array.from({ length: CLOSURE_MAX_BATCH }, (_, i) => `r-${i}`);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: exactly,
            policy: 'SHIFT_END',
            now: NOW,
        });
        expect(preview.totals.ineligibleCount).toBe(200);
    });
});

describe('parseClosureInput / parseClosureFingerprint', () => {
    const valid = { recordIds: ['a', 'b'], policy: 'SHIFT_END' };

    it('menerima input valid', () => {
        expect(parseClosureInput(valid)).toEqual(valid);
    });

    it.each([
        [null, /tidak valid/i],
        ['x', /tidak valid/i],
        [{ ...valid, recordIds: 'a' }, /array/i],
        [{ ...valid, recordIds: [] }, /minimal satu/i],
        [{ ...valid, recordIds: ['a', 'a'] }, /ganda/i],
        [{ ...valid, recordIds: ['a', ''] }, /ID sesi tidak valid/],
        [{ ...valid, recordIds: ['a', 5] }, /ID sesi tidak valid/],
        [{ ...valid, recordIds: ['a'.repeat(101)] }, /ID sesi tidak valid/],
        [{ ...valid, policy: 'OTHER' }, /kebijakan/i],
        [{ ...valid, policy: undefined }, /kebijakan/i],
    ])('menolak input tidak valid (%j)', (input, message) => {
        expect(() => parseClosureInput(input)).toThrow(message);
    });

    it('menolak lebih dari CLOSURE_MAX_BATCH id', () => {
        const recordIds = Array.from({ length: CLOSURE_MAX_BATCH + 1 }, (_, i) => `r-${i}`);
        expect(() => parseClosureInput({ ...valid, recordIds })).toThrow(/maksimal 200/i);
    });

    it('fingerprint harus sha256 hex', () => {
        expect(parseClosureFingerprint('a'.repeat(64))).toBe('a'.repeat(64));
        for (const bad of [undefined, 5, '', 'xyz', 'A'.repeat(64)]) {
            expect(() => parseClosureFingerprint(bad)).toThrow(/pratinjau/i);
        }
    });
});
