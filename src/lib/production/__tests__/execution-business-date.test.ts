import { describe, expect, it } from 'vitest';
import { resolveShiftAwareLogTimes } from '../execution-business-date';

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
