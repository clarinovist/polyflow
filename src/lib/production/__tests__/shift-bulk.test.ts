import { describe, expect, it } from 'vitest';
import { buildBulkShiftRows, partitionBulkShiftRows } from '../shift-bulk';

const T8 = [
    { id: 't1', name: 'Shift Pagi', startTime: '08:00', endTime: '16:00' },
    { id: 't2', name: 'Shift Sore', startTime: '16:00', endTime: '00:00' },
    { id: 't3', name: 'Shift Malam', startTime: '00:00', endTime: '08:00' },
];

describe('buildBulkShiftRows', () => {
    it('menyusun N hari x template berurutan', () => {
        const rows = buildBulkShiftRows('2026-10-05', 2, T8);
        expect(rows).toHaveLength(6);
        expect(rows[0].shiftName).toBe('Shift Pagi');
        expect(rows[0].start.getHours()).toBe(8);
        expect(rows[5].shiftName).toBe('Shift Malam');
    });

    it('shift sore lewat tengah malam berakhir esok hari', () => {
        const rows = buildBulkShiftRows('2026-10-05', 1, [T8[1]]);
        expect(rows).toHaveLength(1);
        expect(rows[0].start.getDate()).toBe(5);
        expect(rows[0].end.getDate()).toBe(6);
        expect(rows[0].end.getHours()).toBe(0);
    });

    it('menolak input tidak valid', () => {
        expect(() => buildBulkShiftRows('05-10-2026', 2, T8)).toThrow();
        expect(() => buildBulkShiftRows('2026-10-05', 0, T8)).toThrow();
        expect(() => buildBulkShiftRows('2026-10-05', 32, T8)).toThrow();
    });
});

describe('partitionBulkShiftRows', () => {
    it('melewati baris yang startTime-nya sudah ada', () => {
        const rows = buildBulkShiftRows('2026-10-05', 1, T8);
        const { fresh, skipped } = partitionBulkShiftRows(rows, new Set([rows[0].start.getTime()]));
        expect(fresh).toHaveLength(2);
        expect(skipped).toHaveLength(1);
    });
});
