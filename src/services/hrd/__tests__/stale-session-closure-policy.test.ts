import { describe, it, expect } from 'vitest';
import {
    computeProposedClockOut,
    computeFingerprint,
    type FingerprintEntry,
} from '../stale-session-closure-policy';
import { calcActualHours } from '../shift-window';

// Tanggal kerja 2026-11-09 (UTC midnight, kolom @db.Date).
const WORK_DATE = new Date('2026-11-09T00:00:00.000Z');
const iso = (d: Date) => d.toISOString();

function shift(startTime: string, endTime: string, plannedHours: number | null = null) {
    return { startTime, endTime, plannedHours };
}

describe('computeProposedClockOut — SHIFT_END', () => {
    const cases: Array<{
        name: string;
        shift: ReturnType<typeof shift>;
        clockIn: string;
        expected: string;
    }> = [
        {
            name: 'shift biasa 08:00-16:00 -> 16:00 WIB hari kerja',
            shift: shift('08:00', '16:00'),
            clockIn: '2026-11-09T01:05:00.000Z', // 08:05 WIB
            expected: '2026-11-09T09:00:00.000Z',
        },
        {
            name: 'shift 00:00-08:00 (bukan lintas tengah malam) -> 08:00 WIB hari kerja',
            shift: shift('00:00', '08:00'),
            clockIn: '2026-11-08T17:10:00.000Z', // 00:10 WIB 9 Nov
            expected: '2026-11-09T01:00:00.000Z',
        },
        {
            name: 'shift lintas tengah malam 20:00-08:00 -> 08:00 WIB hari berikutnya',
            shift: shift('20:00', '08:00'),
            clockIn: '2026-11-09T13:00:00.000Z', // 20:00 WIB
            expected: '2026-11-10T01:00:00.000Z',
        },
        {
            name: 'shift lintas tengah malam, masuk lewat tengah malam (tanggal kerja = hari sebelumnya)',
            shift: shift('20:00', '08:00'),
            clockIn: '2026-11-09T19:00:00.000Z', // 02:00 WIB 10 Nov
            expected: '2026-11-10T01:00:00.000Z',
        },
        {
            name: 'shift 16:00-00:00 -> tengah malam hari berikutnya',
            shift: shift('16:00', '00:00'),
            clockIn: '2026-11-09T09:00:00.000Z', // 16:00 WIB
            expected: '2026-11-09T17:00:00.000Z',
        },
        {
            name: 'durasi tepat 24 jam masih diizinkan (sama dengan correct())',
            shift: shift('08:00', '16:00'),
            clockIn: '2026-11-08T09:00:00.000Z',
            expected: '2026-11-09T09:00:00.000Z',
        },
    ];

    it.each(cases)('$name', ({ shift: s, clockIn, expected }) => {
        const result = computeProposedClockOut('SHIFT_END', {
            clockInAt: new Date(clockIn),
            workDate: WORK_DATE,
            shift: s,
        });
        expect(result).toEqual({ ok: true, clockOutAt: new Date(expected) });
        if (result.ok) expect(iso(result.clockOutAt)).toBe(expected);
    });

    it('tidak layak bila jam masuk sesudah akhir shift', () => {
        const result = computeProposedClockOut('SHIFT_END', {
            clockInAt: new Date('2026-11-09T10:00:00.000Z'), // 17:00 WIB
            workDate: WORK_DATE,
            shift: shift('08:00', '16:00'),
        });
        expect(result).toEqual({
            ok: false,
            reason: 'Jam masuk melewati akhir shift; tutup manual lewat Koreksi jam',
        });
    });

    it('tidak layak bila jam masuk tepat sama dengan akhir shift (durasi 0)', () => {
        const result = computeProposedClockOut('SHIFT_END', {
            clockInAt: new Date('2026-11-09T09:00:00.000Z'),
            workDate: WORK_DATE,
            shift: shift('08:00', '16:00'),
        });
        expect(result.ok).toBe(false);
    });

    it('tidak layak bila durasi lebih dari 24 jam', () => {
        const result = computeProposedClockOut('SHIFT_END', {
            clockInAt: new Date('2026-11-08T01:00:00.000Z'), // 32 jam sebelum 16:00 WIB
            workDate: WORK_DATE,
            shift: shift('08:00', '16:00'),
        });
        expect(result).toEqual({
            ok: false,
            reason: 'Durasi kerja melebihi 24 jam; tutup manual lewat Koreksi jam',
        });
    });

    it.each(['abc', '8:00', '24:00', '12:60', ''])(
        'tidak layak bila jam selesai shift tidak valid (%s)',
        (bad) => {
            const result = computeProposedClockOut('SHIFT_END', {
                clockInAt: new Date('2026-11-09T01:00:00.000Z'),
                workDate: WORK_DATE,
                shift: shift('08:00', bad),
            });
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toMatch(/jam shift tidak valid/i);
        },
    );
});

describe('computeProposedClockOut — CLOCK_IN_PLUS_PLANNED', () => {
    const clockIn = new Date('2026-11-09T01:30:00.000Z'); // 08:30 WIB (terlambat)

    it('jam masuk + jam terjadwal efektif dari start/end shift', () => {
        const result = computeProposedClockOut('CLOCK_IN_PLUS_PLANNED', {
            clockInAt: clockIn,
            workDate: WORK_DATE,
            shift: shift('08:00', '16:00'),
        });
        expect(result).toEqual({
            ok: true,
            clockOutAt: new Date('2026-11-09T09:30:00.000Z'),
        });
    });

    it('memakai plannedHours override shift bila ada', () => {
        const result = computeProposedClockOut('CLOCK_IN_PLUS_PLANNED', {
            clockInAt: clockIn,
            workDate: WORK_DATE,
            shift: shift('08:00', '16:00', 7),
        });
        expect(result).toEqual({
            ok: true,
            clockOutAt: new Date('2026-11-09T08:30:00.000Z'),
        });
    });

    it('shift lintas tengah malam 20:00-08:00 = 12 jam', () => {
        const result = computeProposedClockOut('CLOCK_IN_PLUS_PLANNED', {
            clockInAt: new Date('2026-11-09T13:00:00.000Z'),
            workDate: WORK_DATE,
            shift: shift('20:00', '08:00'),
        });
        expect(result).toEqual({
            ok: true,
            clockOutAt: new Date('2026-11-10T01:00:00.000Z'),
        });
    });

    it('jam terjadwal pecahan (8,33 jam) menghasilkan lembur 0 setelah pembulatan jam kerja', () => {
        const result = computeProposedClockOut('CLOCK_IN_PLUS_PLANNED', {
            clockInAt: clockIn,
            workDate: WORK_DATE,
            shift: shift('08:00', '16:20'),
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Number.isInteger(result.clockOutAt.getTime())).toBe(true);
        expect(calcActualHours(clockIn, result.clockOutAt)).toBe(8.33);
    });

    it('tidak layak bila jam terjadwal melebihi 24 jam', () => {
        const result = computeProposedClockOut('CLOCK_IN_PLUS_PLANNED', {
            clockInAt: clockIn,
            workDate: WORK_DATE,
            shift: shift('08:00', '16:00', 30),
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/melebihi 24 jam/i);
    });
});

describe('computeFingerprint', () => {
    const entries: FingerprintEntry[] = [
        {
            id: 'rec-b',
            updatedAt: new Date('2026-11-10T01:00:00.000Z'),
            proposedClockOutAt: new Date('2026-11-09T09:00:00.000Z'),
            earnings: 99000,
        },
        {
            id: 'rec-a',
            updatedAt: new Date('2026-11-10T02:00:00.000Z'),
            proposedClockOutAt: null,
            earnings: 0,
        },
    ];
    const base = computeFingerprint('SHIFT_END', entries);

    it('berupa sha256 hex 64 karakter', () => {
        expect(base).toMatch(/^[0-9a-f]{64}$/);
    });

    it('stabil terhadap urutan id', () => {
        expect(computeFingerprint('SHIFT_END', [...entries].reverse())).toBe(base);
    });

    it('berubah bila kebijakan berubah', () => {
        expect(computeFingerprint('CLOCK_IN_PLUS_PLANNED', entries)).not.toBe(base);
    });

    it('berubah bila updatedAt salah satu record berubah', () => {
        const changed = entries.map((e, i) =>
            i === 0 ? { ...e, updatedAt: new Date('2026-11-10T01:00:00.001Z') } : e,
        );
        expect(computeFingerprint('SHIFT_END', changed)).not.toBe(base);
    });

    it('berubah bila jam pulang usulan berubah', () => {
        const changed = entries.map((e, i) =>
            i === 0
                ? { ...e, proposedClockOutAt: new Date('2026-11-09T09:00:01.000Z') }
                : e,
        );
        expect(computeFingerprint('SHIFT_END', changed)).not.toBe(base);
    });

    it('berubah bila upah usulan berubah (mis. jam shift diedit setelah pratinjau)', () => {
        const changed = entries.map((e, i) => (i === 0 ? { ...e, earnings: 98000 } : e));
        expect(computeFingerprint('SHIFT_END', changed)).not.toBe(base);
    });

    it('berubah bila himpunan id berubah (ganti atau tambah)', () => {
        const swapped = entries.map((e, i) => (i === 0 ? { ...e, id: 'rec-c' } : e));
        expect(computeFingerprint('SHIFT_END', swapped)).not.toBe(base);
        expect(
            computeFingerprint('SHIFT_END', [
                ...entries,
                { id: 'rec-z', updatedAt: null, proposedClockOutAt: null, earnings: 0 },
            ]),
        ).not.toBe(base);
    });

    it('record tidak ditemukan (updatedAt null) berbeda dari record ada', () => {
        const missing = entries.map((e, i) =>
            i === 1 ? { ...e, updatedAt: null } : e,
        );
        expect(computeFingerprint('SHIFT_END', missing)).not.toBe(base);
    });
});
