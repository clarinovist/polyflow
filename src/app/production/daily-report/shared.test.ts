import { describe, it, expect } from 'vitest';
import type { MachineTotals } from '@/services/production/production-daily-report-service';
import {
    PROCESS_LABEL,
    dayName,
    fmt,
    affalPercent,
    machineDisplayName,
    machineTypeLabel,
} from './shared';

const mt = (
    machineName: string | null,
    machineType: string | null,
): MachineTotals => ({
    machineName,
    machineType,
    produced: 0,
    scrap: 0,
    entries: 0,
});

describe('affalPercent', () => {
    it('computes affal share of gross output, 1 decimal', () => {
        expect(affalPercent(780.4, 61.8)).toBeCloseTo(7.3, 5);
        expect(affalPercent(135, 44.1)).toBeCloseTo(24.6, 5);
        expect(affalPercent(100, 0)).toBe(0);
    });

    it('returns null when there is nothing to divide', () => {
        expect(affalPercent(0, 0)).toBeNull();
    });

    it('handles affal-only (produced 0) as 100%', () => {
        expect(affalPercent(0, 12)).toBe(100);
    });
});

describe('dayName', () => {
    it('returns Indonesian weekday for the WIB business date', () => {
        // 2026-08-29 is a Saturday
        expect(dayName('2026-08-29')).toBe('Sabtu');
        expect(dayName('2026-08-30')).toBe('Minggu');
    });
});

describe('fmt', () => {
    it('formats with Indonesian thousand separators', () => {
        expect(fmt(1530)).toBe('1.530');
        expect(fmt(0)).toBe('0');
    });
});

describe('machineDisplayName / machineTypeLabel', () => {
    it('prefers machine name, falls back to type, then placeholder', () => {
        expect(machineDisplayName(mt('Extruder KW 2', 'EXTRUDER'))).toBe(
            'Extruder KW 2',
        );
        expect(machineDisplayName(mt(null, 'MIXER'))).toBe('MIXER');
        expect(machineDisplayName(mt(null, null))).toBe('(tanpa mesin)');
    });

    it('title-cases the type hint when a machine name exists, keeps raw type otherwise', () => {
        expect(machineTypeLabel(mt('Extruder KW 2', 'EXTRUDER'))).toBe(
            'Extruder',
        );
        expect(machineTypeLabel(mt(null, 'MIXER HD'))).toBe('MIXER HD');
        expect(machineTypeLabel(mt('Mixer 1', null))).toBeNull();
    });
});

describe('PROCESS_LABEL', () => {
    it('maps all process keys to Indonesian labels', () => {
        expect(PROCESS_LABEL.MIXING).toBe('Mixing');
        expect(PROCESS_LABEL.EXTRUSION).toBe('Extrusi');
        expect(PROCESS_LABEL.PACKING).toBe('Packing');
        expect(PROCESS_LABEL.OTHER).toBe('Lainnya');
    });
});
