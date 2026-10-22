import { describe, expect, it } from 'vitest';
import {
    groupOperatorsByProcess,
    type OperatorProcessRow,
} from '../operator-comparison';

const row = (
    process: OperatorProcessRow['process'],
    operatorName: string,
    totalQuantityProduced: number,
    totalScrapQuantity = 0,
): OperatorProcessRow => ({
    process,
    operatorName,
    operatorCode: operatorName.slice(0, 3).toUpperCase(),
    totalQuantityProduced,
    totalScrapQuantity,
    ordersHandled: 1,
    scrapRate: 0,
});

describe('groupOperatorsByProcess', () => {
    it('returns no groups for no rows', () => {
        expect(groupOperatorsByProcess([])).toEqual([]);
    });

    it('groups by process in the fixed process order', () => {
        const groups = groupOperatorsByProcess([
            row('PACKING', 'Sari', 10),
            row('MIXING', 'Budi', 20),
            row('EXTRUSION', 'Andi', 30),
        ]);
        expect(groups.map((g) => g.process)).toEqual([
            'MIXING',
            'EXTRUSION',
            'PACKING',
        ]);
    });

    it('omits processes without rows', () => {
        const groups = groupOperatorsByProcess([row('EXTRUSION', 'Andi', 5)]);
        expect(groups).toHaveLength(1);
        expect(groups[0].process).toBe('EXTRUSION');
    });

    it('sorts operators by name, never by output (no ranking)', () => {
        const [group] = groupOperatorsByProcess([
            row('PACKING', 'Sari', 9999),
            row('PACKING', 'Ani', 1),
            row('PACKING', 'Budi', 500),
        ]);
        expect(group.operators.map((o) => o.operatorName)).toEqual([
            'Ani',
            'Budi',
            'Sari',
        ]);
    });

    it('computes the per-process affal share from that process only', () => {
        const [group] = groupOperatorsByProcess([
            row('PACKING', 'Ani', 825, 175),
        ]);
        expect(group.operators[0].affalPercent).toBe(17.5);
    });

    it('returns a null share when there is no output and no affal', () => {
        const [group] = groupOperatorsByProcess([row('MIXING', 'Ani', 0, 0)]);
        expect(group.operators[0].affalPercent).toBeNull();
    });

    it('does not mutate its input', () => {
        const input = [row('PACKING', 'Sari', 1), row('PACKING', 'Ani', 2)];
        const snapshot = input.map((r) => r.operatorName);
        groupOperatorsByProcess(input);
        expect(input.map((r) => r.operatorName)).toEqual(snapshot);
    });
});
