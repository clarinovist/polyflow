import { describe, expect, it } from 'vitest';
import {
    isNightTailShiftStart,
    resolveShiftAwareLogTimes,
} from '../execution-business-date';

/**
 * Semua tanggal dibangun sebagai instan UTC eksplisit supaya test deterministik.
 * WIB = UTC+7 → tengah malam WIB 2026-09-02 00:00 = 2026-09-01T17:00:00Z.
 */
const day1 = '2026-09-01';
const day2 = '2026-09-02';

/** '2026-09-01T22:00' WIB → Date UTC */
function wib(dateStr: string, timeStr: string): Date {
    return new Date(`${dateStr}T${timeStr}:00.000+07:00`);
}

describe('resolveShiftAwareLogTimes', () => {
    it.each(['2026-09-02', '2026-09-01', '2026-08-20'])(
        'explicit date %s overrides automatic shift and client times', (productionDate) => {
            const result = resolveShiftAwareLogTimes({
                logAt: wib(day2, '00:05'),
                productionDate,
                clientStart: wib(day2, '00:05'),
                clientEnd: wib(day2, '00:05'),
                shiftStart: wib(day1, '22:00'),
            });
            expect(result.startTime).toEqual(wib(productionDate, '00:00'));
            expect(result.endTime).toEqual(result.startTime);
            expect(result.backdated).toBe(false);
        },
    );

    it.each(['', '2026-02-30', '2026-09-03'])(
        'rejects explicit invalid/future date %s', (productionDate) => {
            expect(() => resolveShiftAwareLogTimes({
                logAt: wib(day2, '00:05'), productionDate,
            })).toThrow(/Tanggal produksi/);
        },
    );

    it('backdate ke mulai shift saat entri otomatis nyebrang tengah malam', () => {
        // Shift 3 mulai 22:00 hari-1; operator log hasil jam 00:30 hari-2.
        const logAt = wib(day2, '00:30');
        const shiftStart = wib(day1, '22:00');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(true);
        expect(result.startTime.getTime()).toBe(shiftStart.getTime());
        expect(result.endTime.getTime()).toBe(shiftStart.getTime());
    });

    it('tidak backdate saat shift dan entri di hari yang sama', () => {
        const logAt = wib(day2, '10:00');
        const shiftStart = wib(day2, '07:00');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
        expect(result.endTime.getTime()).toBe(logAt.getTime());
    });

    it('menghormati waktu yang diisi deliberate user (batch form) walau nyebrang', () => {
        const logAt = wib(day2, '00:30');
        const shiftStart = wib(day1, '22:00');
        const editedStart = wib(day1, '23:15');
        const editedEnd = wib(day2, '00:20');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: editedStart,
            clientEnd: editedEnd,
            shiftStart,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(editedStart.getTime());
        expect(result.endTime.getTime()).toBe(editedEnd.getTime());
    });

    it('waktu client beda >15 menit dari logAt dianggap deliberate meski hanya start', () => {
        const logAt = wib(day2, '00:30');
        const shiftStart = wib(day1, '22:00');
        const editedStart = wib(day1, '23:00');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: editedStart,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(editedStart.getTime());
        // end tidak diisi client → pakai logAt
        expect(result.endTime.getTime()).toBe(logAt.getTime());
    });

    it('waktu client dalam toleransi 15 menit tetap dianggap auto → backdate', () => {
        const logAt = wib(day2, '00:10');
        const shiftStart = wib(day1, '22:00');
        // AddOutputDialog mengirim now saat submit; kiosk log clock skew kecil.
        const clientStart = new Date(logAt.getTime() - 10 * 60 * 1000);

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(true);
        expect(result.startTime.getTime()).toBe(shiftStart.getTime());
    });

    it('toleransi 15 menit: clientStart beda 15 menit pas masih auto', () => {
        const logAt = wib(day2, '00:10');
        const shiftStart = wib(day1, '22:00');
        const clientStart = new Date(logAt.getTime() - 15 * 60 * 1000);

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(true);
    });

    it('shiftStart null → tanpa backdate', () => {
        const logAt = wib(day2, '00:30');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart: null,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
    });

    it('shiftStart di masa depan relatif logAt → tanpa backdate', () => {
        const logAt = wib(day2, '00:30');
        const shiftStart = wib(day2, '01:00');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
    });

    it('shiftStart lebih dari 24 jam sebelum logAt → tanpa backdate (entri telat)', () => {
        const logAt = wib(day2, '21:00');
        const shiftStart = wib(day1, '20:00'); // 25 jam lalu

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
    });

    it('shiftStart tepat 24 jam sebelum logAt → masih backdate (batas inklusif)', () => {
        const logAt = wib(day2, '22:00');
        const shiftStart = wib(day1, '22:00'); // tepat 24 jam

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(true);
    });

    it('nyebrang tengah malam dengan shiftStart sesaat sebelum logAt (menit menjelang 00:00)', () => {
        // Shift mulai 23:50 hari-1, log jam 00:05 hari-2 — 15 menit gap.
        const logAt = wib(day2, '00:05');
        const shiftStart = wib(day1, '23:50');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart,
        });

        expect(result.backdated).toBe(true);
        expect(result.startTime.getTime()).toBe(shiftStart.getTime());
    });

    it('tanpa client times dan tanpa shift → start = end = logAt', () => {
        const logAt = wib(day2, '14:00');

        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: undefined,
            clientEnd: undefined,
            shiftStart: undefined,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
        expect(result.endTime.getTime()).toBe(logAt.getTime());
    });
});

/**
 * Skema 8 jam: shift 1 = 08:00–16:00, shift 2 = 16:00–00:00,
 * shift 3 = 00:00–08:00 esok pagi (ekor siklus hari sebelumnya).
 * Hasil shift 3 harus masuk tanggal siklus yang sama dengan shift 1 & 2.
 */
describe('resolveShiftAwareLogTimes — shift 3 (mulai 00:00 WIB)', () => {
    const shift3Start = wib(day2, '00:00');
    const shift3End = wib(day2, '08:00');
    /** Tanggal siklus sebelumnya = hari shift 1 & 2 (day1). */
    const cycleDate = wib(day1, '00:00');

    it.each(['00:05', '00:30', '03:00', '07:59'])(
        'entri jam %s pada hari shift 3 → pindah ke tanggal siklus sebelumnya',
        (time) => {
            const result = resolveShiftAwareLogTimes({
                logAt: wib(day2, time),
                clientStart: null,
                clientEnd: null,
                shiftStart: shift3Start,
                shiftEnd: shift3End,
            });

            expect(result.backdated).toBe(true);
            expect(result.startTime.getTime()).toBe(cycleDate.getTime());
            expect(result.endTime.getTime()).toBe(cycleDate.getTime());
        },
    );

    it('entri sesaat setelah shift 3 selesai (dalam grace 2 jam) tetap masuk siklus kemarin', () => {
        const result = resolveShiftAwareLogTimes({
            logAt: wib(day2, '09:30'), // 1,5 jam setelah shift berakhir 08:00
            clientStart: null,
            clientEnd: null,
            shiftStart: shift3Start,
            shiftEnd: shift3End,
        });

        expect(result.backdated).toBe(true);
        expect(result.startTime.getTime()).toBe(cycleDate.getTime());
    });

    it('entri jauh melewati jendela shift 3 (lewat grace) tidak digeser', () => {
        const logAt = wib(day2, '10:30'); // 2,5 jam setelah shift berakhir
        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart: shift3Start,
            shiftEnd: shift3End,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
    });

    it('shift 3 basi >24 jam → tidak digeser (guard tetap berlaku)', () => {
        const logAt = wib('2026-09-03', '00:30'); // 48,5 jam setelah shift mulai
        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart: shift3Start,
            shiftEnd: shift3End,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
    });

    it('shiftEnd tidak diketahui → cabang shift 3 tidak aktif (perilaku lama)', () => {
        const logAt = wib(day2, '00:30');
        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart: shift3Start,
            shiftEnd: null,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
    });

    it('productionDate eksplisit menang atas aturan shift 3', () => {
        const result = resolveShiftAwareLogTimes({
            logAt: wib(day2, '00:30'),
            productionDate: day2,
            shiftStart: shift3Start,
            shiftEnd: shift3End,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(wib(day2, '00:00').getTime());
    });

    it('waktu yang diedit user (deliberate) tidak digeser oleh aturan shift 3', () => {
        // clientStart 30 menit sebelum logAt (> toleransi 15 menit) = edit manual.
        const editedStart = wib(day2, '01:00');
        const result = resolveShiftAwareLogTimes({
            logAt: wib(day2, '01:30'),
            clientStart: editedStart,
            clientEnd: wib(day2, '01:30'),
            shiftStart: shift3Start,
            shiftEnd: shift3End,
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(editedStart.getTime());
    });

    it('shift 1 (mulai 08:00) dengan entri di hari yang sama tidak digeser', () => {
        const logAt = wib(day2, '15:00');
        const result = resolveShiftAwareLogTimes({
            logAt,
            clientStart: null,
            clientEnd: null,
            shiftStart: wib(day2, '08:00'),
            shiftEnd: wib(day2, '16:00'),
        });

        expect(result.backdated).toBe(false);
        expect(result.startTime.getTime()).toBe(logAt.getTime());
    });

    it('shift sore yang berakhir tengah malam tetap memakai aturan lama (backdate ke mulai shift)', () => {
        const shift2Start = wib(day1, '16:00');
        const result = resolveShiftAwareLogTimes({
            logAt: wib(day2, '00:30'),
            clientStart: null,
            clientEnd: null,
            shiftStart: shift2Start,
            shiftEnd: wib(day2, '00:00'),
        });

        expect(result.backdated).toBe(true);
        expect(result.startTime.getTime()).toBe(shift2Start.getTime());
    });
});

describe('isNightTailShiftStart', () => {
    it.each([
        ['00:00', true],
        ['00:59', true],
        ['01:00', false],
        ['08:00', false],
        ['16:00', false],
        ['20:00', false],
        ['23:59', false],
    ] as const)('jam mulai WIB %s → %s', (time, expected) => {
        expect(isNightTailShiftStart(wib(day2, time))).toBe(expected);
    });

    it('menghitung waktu WIB, bukan waktu UTC server', () => {
        // 2026-09-01 17:00 UTC = 2026-09-02 00:00 WIB → shift 3
        expect(isNightTailShiftStart(new Date('2026-09-01T17:00:00.000Z'))).toBe(true);
        // 2026-09-01 01:00 UTC = 2026-09-01 08:00 WIB → shift 1
        expect(isNightTailShiftStart(new Date('2026-09-01T01:00:00.000Z'))).toBe(false);
    });
});
