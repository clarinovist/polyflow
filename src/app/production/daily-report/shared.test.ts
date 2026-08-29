import { describe, it, expect } from 'vitest';
import type { MachineTotals } from '@/services/production/production-daily-report-service';
import {
    PROCESS_LABEL,
    dayName,
    fmt,
    affalPercent,
    machineDisplayName,
    machineTypeLabel,
    monthLabelId,
    recentMonthOptions,
    sanitizeBusinessDateParam,
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

describe('monthLabelId', () => {
    it('renders YYYY-MM as long Indonesian month + year', () => {
        expect(monthLabelId('2026-08')).toBe('Agustus 2026');
        expect(monthLabelId('2026-01')).toBe('Januari 2026');
    });

    it('passes through malformed input untouched', () => {
        expect(monthLabelId('all')).toBe('all');
    });
});

describe('recentMonthOptions', () => {
    it('lists the last N WIB months including current, latest first', () => {
        // 2026-08-31T18:00:00Z is already 2026-09-01 01:00 WIB — the WIB
        // month, not the UTC month, must win.
        const nearMidnightWib = new Date('2026-08-31T18:00:00.000Z');
        expect(recentMonthOptions(3, nearMidnightWib)).toEqual([
            '2026-09',
            '2026-08',
            '2026-07',
        ]);
    });

    it('wraps across year boundary', () => {
        expect(recentMonthOptions(3, new Date('2026-01-10T10:00:00.000Z'))).toEqual(
            ['2026-01', '2025-12', '2025-11'],
        );
    });
});

describe('sanitizeBusinessDateParam', () => {
    it('passes valid business dates through', () => {
        expect(sanitizeBusinessDateParam('2026-08-29')).toBe('2026-08-29');
    });

    it('returns null for absent, malformed, or impossible dates', () => {
        expect(sanitizeBusinessDateParam(undefined)).toBeNull();
        expect(sanitizeBusinessDateParam('')).toBeNull();
        expect(sanitizeBusinessDateParam('blah')).toBeNull();
        expect(sanitizeBusinessDateParam('26-08-2026')).toBeNull();
        expect(sanitizeBusinessDateParam('2026-02-30')).toBeNull();
        expect(sanitizeBusinessDateParam('2026-13-01')).toBeNull();
    });
});
