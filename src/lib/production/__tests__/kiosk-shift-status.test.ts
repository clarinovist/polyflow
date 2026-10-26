import { describe, expect, it } from 'vitest';
import { pickRekapShift, summarizeShiftOutput } from '../kiosk-shift-status';

interface ShiftLite {
    id: string;
    shiftName: string;
    startTime: Date | string;
    endTime: Date | string;
    operatorId: string | null;
}

const ms = (iso: string) => new Date(iso).getTime();

// Shift malam 12 jam: 20:00 H → 08:00 H+1 (pola tenant rafia)
const NIGHT: ShiftLite = {
    id: 'night',
    shiftName: 'Shift Malam',
    startTime: '2026-09-01T13:00:00.000Z', // 1 Sep 20:00 WIB
    endTime: '2026-09-02T01:00:00.000Z', // 2 Sep 08:00 WIB
    operatorId: null,
};
const DAY: ShiftLite = {
    id: 'day',
    shiftName: 'Shift Pagi',
    startTime: '2026-09-02T01:00:00.000Z', // 2 Sep 08:00 WIB
    endTime: '2026-09-02T07:00:00.000Z', // 2 Sep 14:00 WIB
    operatorId: null,
};

describe('pickRekapShift', () => {
    it('returns active shift (operator match first) with stale=false', () => {
        const mine: ShiftLite = { ...DAY, id: 'mine', operatorId: 'op-1' };
        const res = pickRekapShift([NIGHT, mine], ms('2026-09-02T03:00:00Z'), 'op-1');
        expect(res.shift?.id).toBe('mine');
        expect(res.stale).toBe(false);
    });

    it('returns any active shift when operator has no match, stale=false', () => {
        const res = pickRekapShift([NIGHT, DAY], ms('2026-09-02T03:00:00Z'), 'op-9');
        expect(res.shift?.id).toBe('day');
        expect(res.stale).toBe(false);
    });

    it('flags stale when no shift is active and falls back to last', () => {
        // 2 Sep 16:00:01 WIB — 1 detik setelah DAY selesai (14:00 WIB), sebelum NIGHT yang baru nilainya di hari berikutnya
        const res = pickRekapShift([NIGHT, DAY], ms('2026-09-02T07:00:01Z'));
        expect(res.shift?.id).toBe('day');
        expect(res.stale).toBe(true);
    });

    it('flags stale=false when fallback is the currently active night shift (crosses midnight)', () => {
        // 2 Sep 01:00 WIB — NIGHT (20:00→08:00) sedang aktif meski dini hari H+1
        const res = pickRekapShift([NIGHT], ms('2026-09-01T18:00:00Z'));
        expect(res.shift?.id).toBe('night');
        expect(res.stale).toBe(false);
    });

    it('returns stale=false with null shift when shifts list is empty (generic kiosk)', () => {
        const res = pickRekapShift([], ms('2026-09-02T03:00:00Z'));
        expect(res.shift).toBeNull();
        expect(res.stale).toBe(false);
    });

    it('accepts Date objects as well as ISO strings', () => {
        const asDates: ShiftLite = {
            ...DAY,
            startTime: new Date('2026-09-02T01:00:00.000Z'),
            endTime: new Date('2026-09-02T07:00:00.000Z'),
        };
        const res = pickRekapShift([asDates], ms('2026-09-02T02:00:00Z'));
        expect(res.shift?.id).toBe('day');
        expect(res.stale).toBe(false);
    });
});

describe('summarizeShiftOutput', () => {
    const units = { primaryUnit: 'KG', hasAlternateUnit: true, conversionFactor: 50 };
    const done = '2026-10-26T05:00:00.000Z';
    const executions = [
        { id: 'a', endTime: done, status: 'COMPLETED', shiftId: 's1', operatorId: 'op-a', quantityProduced: 100, enteredQuantity: 2, enteredUnit: 'BAL' },
        { id: 'b', endTime: done, status: 'COMPLETED', shiftId: 's1', operatorId: 'op-b', quantityProduced: 50, enteredQuantity: null, enteredUnit: null },
        { id: 'void', endTime: done, status: 'VOIDED', shiftId: 's1', operatorId: 'op-a', quantityProduced: 500 },
        { id: 'other-shift', endTime: done, status: 'COMPLETED', shiftId: 's2', operatorId: 'op-a', quantityProduced: 500 },
        { id: 'running', endTime: null, status: 'COMPLETED', shiftId: 's1', operatorId: 'op-a', quantityProduced: 0 },
    ];

    it('reports shift totals in the display unit, not raw base quantities', () => {
        const result = summarizeShiftOutput(executions, 's1', 'op-a', units);

        expect(result.myTotal).toBe(2);
        expect(result.orderTotal).toBe(3);
    });

    it('labels each log with the unit its quantity is in', () => {
        const result = summarizeShiftOutput(executions, 's1', 'op-a', units);

        expect(result.logs.map((log) => [log.execution.id, log.quantity, log.unit])).toEqual([
            ['a', 2, 'BAL'],
            ['b', 50, 'KG'],
        ]);
    });

    it('keeps base quantities when the product has no alternate unit', () => {
        const result = summarizeShiftOutput(executions, 's1', 'op-b', { ...units, hasAlternateUnit: false, conversionFactor: 1 });

        expect(result.myTotal).toBe(50);
        expect(result.orderTotal).toBe(150);
    });
});
