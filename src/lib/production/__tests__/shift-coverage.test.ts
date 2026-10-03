import { describe, expect, it } from 'vitest';
import {
    assessMissingShift,
    hasActiveShift,
    lastShiftEnd,
    lastShiftStart,
    missingShiftMessage,
} from '../shift-coverage';

/** 2026-10-03 12:00 WIB = 05:00 UTC */
const NOON_WIB = new Date('2026-10-03T05:00:00.000Z');
/** Shift malam 2026-10-02 22:00 WIB → 2026-10-03 06:00 WIB */
const NIGHT_SHIFT = {
    startTime: new Date('2026-10-02T15:00:00.000Z'),
    endTime: new Date('2026-10-02T23:00:00.000Z'),
};
/** Shift siang 2026-10-03 08:00 → 16:00 WIB */
const DAY_SHIFT = {
    startTime: new Date('2026-10-03T01:00:00.000Z'),
    endTime: new Date('2026-10-03T09:00:00.000Z'),
};

describe('hasActiveShift', () => {
    it('menghitung shift yang mencakup now (inklusif di kedua ujung)', () => {
        expect(hasActiveShift([NIGHT_SHIFT, DAY_SHIFT], NOON_WIB)).toBe(true);
        expect(hasActiveShift([DAY_SHIFT], DAY_SHIFT.startTime)).toBe(true);
        expect(hasActiveShift([DAY_SHIFT], DAY_SHIFT.endTime)).toBe(true);
    });

    it('false saat semua window sudah lewat, belum mulai, atau daftar kosong', () => {
        expect(hasActiveShift([NIGHT_SHIFT], NOON_WIB)).toBe(false);
        expect(hasActiveShift([DAY_SHIFT], new Date('2026-10-03T00:00:00.000Z'))).toBe(false);
        expect(hasActiveShift([], NOON_WIB)).toBe(false);
        expect(hasActiveShift(null, NOON_WIB)).toBe(false);
        expect(hasActiveShift(undefined, NOON_WIB)).toBe(false);
    });

    it('menerima string ISO dari serialization', () => {
        expect(
            hasActiveShift(
                [
                    {
                        startTime: DAY_SHIFT.startTime.toISOString(),
                        endTime: DAY_SHIFT.endTime.toISOString(),
                    },
                ],
                NOON_WIB,
            ),
        ).toBe(true);
    });
});

describe('lastShiftStart / lastShiftEnd', () => {
    it('mengambil waktu paling akhir, bukan urutan array', () => {
        expect(lastShiftStart([DAY_SHIFT, NIGHT_SHIFT])).toEqual(DAY_SHIFT.startTime);
        expect(lastShiftEnd([DAY_SHIFT, NIGHT_SHIFT])).toEqual(DAY_SHIFT.endTime);
    });

    it('null saat tidak ada shift', () => {
        expect(lastShiftStart([])).toBeNull();
        expect(lastShiftEnd([])).toBeNull();
        expect(lastShiftStart(null)).toBeNull();
        expect(lastShiftEnd(undefined)).toBeNull();
    });
});

describe('assessMissingShift', () => {
    const createdAt = new Date('2026-09-28T00:00:00.000Z');

    it('tidak alert bila ada shift yang mencakup sekarang', () => {
        const result = assessMissingShift({
            shifts: [DAY_SHIFT],
            executions: [],
            createdAt,
            now: NOON_WIB,
        });
        expect(result.alert).toBe(false);
        expect(result.neverHadShift).toBe(false);
    });

    it('alert merah bila produksi 24 jam terakhir tapi shift sudah lewat', () => {
        const result = assessMissingShift({
            shifts: [NIGHT_SHIFT],
            executions: [{ startTime: new Date('2026-10-03T04:00:00.000Z') }],
            createdAt,
            now: NOON_WIB,
        });
        expect(result.alert).toBe(true);
        expect(result.severity).toBe('red');
        expect(result.lastShiftStart).toEqual(NIGHT_SHIFT.startTime);
        // Night shift berakhir 06:00 WIB → 6 jam = 360 menit sebelum 12:00 WIB
        expect(result.ageMinutes).toBe(360);
    });

    it('produksi tepat 24 jam lalu masih dihitung (batas inklusif)', () => {
        const exact = assessMissingShift({
            shifts: [NIGHT_SHIFT],
            executions: [
                { startTime: new Date(NOON_WIB.getTime() - 24 * 60 * 60 * 1000) },
            ],
            createdAt,
            now: NOON_WIB,
        });
        expect(exact.alert).toBe(true);

        const tooOld = assessMissingShift({
            shifts: [NIGHT_SHIFT],
            executions: [
                {
                    startTime: new Date(
                        NOON_WIB.getTime() - 24 * 60 * 60 * 1000 - 1,
                    ),
                },
            ],
            createdAt,
            now: NOON_WIB,
        });
        expect(tooOld.alert).toBe(false);
    });

    it('SPK dorman (shift lewat, tanpa produksi 24 jam) tidak di-alert', () => {
        const result = assessMissingShift({
            shifts: [NIGHT_SHIFT],
            executions: [
                { startTime: new Date('2026-10-01T05:00:00.000Z') },
            ],
            createdAt,
            now: NOON_WIB,
        });
        expect(result.alert).toBe(false);
    });

    it('SPK tanpa shift sama sekali tetap di-alert meski belum produksi', () => {
        const result = assessMissingShift({
            shifts: [],
            executions: [],
            createdAt,
            now: NOON_WIB,
        });
        expect(result.alert).toBe(true);
        expect(result.severity).toBe('amber');
        expect(result.neverHadShift).toBe(true);
        expect(result.lastShiftStart).toBeNull();
        // Sejak SPK dibuat (28 Sep 07:00 WIB → 3 Okt 12:00 WIB)
        expect(result.ageMinutes).toBeGreaterThan(0);
    });
});

describe('missingShiftMessage', () => {
    it('menyebut shift terakhir untuk SPK yang sudah punya shift', () => {
        const msg = missingShiftMessage([NIGHT_SHIFT], NOON_WIB);
        expect(msg).toContain('02 Oct 22:00');
        expect(msg).toContain('salah tanggal');
    });

    it('menyebut kewajiban membuat shift untuk SPK yang belum punya shift', () => {
        const msg = missingShiftMessage([], NOON_WIB);
        expect(msg).toContain('belum punya shift');
        expect(msg).toContain('03 Oct 2026');
    });
});
