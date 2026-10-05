import { describe, expect, it } from 'vitest';
import { formatShiftOptionLabel } from '../shift-label';

describe('formatShiftOptionLabel', () => {
    it('memuat nama, tanggal, dan jam mulai-selesai', () => {
        expect(
            formatShiftOptionLabel({
                shiftName: 'Shift Malam',
                startTime: new Date('2026-10-03T17:00:00Z'),
                endTime: new Date('2026-10-04T01:00:00Z'),
            }),
        ).toBe('Shift Malam \u2022 04 Oct 00:00\u201308:00');
    });

    it('membedakan dua shift bernama sama beda hari', () => {
        const a = formatShiftOptionLabel({
            shiftName: 'Shift Malam',
            startTime: new Date('2026-09-27T17:00:00Z'),
            endTime: new Date('2026-09-28T01:00:00Z'),
        });
        const b = formatShiftOptionLabel({
            shiftName: 'Shift Malam',
            startTime: new Date('2026-10-02T17:00:00Z'),
            endTime: new Date('2026-10-03T01:00:00Z'),
        });
        expect(a).toBe('Shift Malam \u2022 28 Sep 00:00\u201308:00');
        expect(b).toBe('Shift Malam \u2022 03 Oct 00:00\u201308:00');
        expect(a).not.toBe(b);
    });
});
