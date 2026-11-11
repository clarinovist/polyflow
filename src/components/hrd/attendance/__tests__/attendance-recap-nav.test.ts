import { describe, it, expect } from 'vitest';
import {
    ATTENDANCE_PATH,
    buildExportHref,
    parseViewMode,
    withParam,
    withPeriod,
    withViewMode,
} from '../attendance-recap-nav';

describe('attendance-recap-nav', () => {
    it('exposes the attendance path', () => {
        expect(ATTENDANCE_PATH).toBe('/hrd/attendance');
    });

    it('parses the view mode and defaults to daily', () => {
        expect(parseViewMode('weekly')).toBe('weekly');
        expect(parseViewMode('monthly')).toBe('monthly');
        expect(parseViewMode('daily')).toBe('daily');
        expect(parseViewMode('bogus')).toBe('daily');
        expect(parseViewMode(null)).toBe('daily');
    });

    it('sets and removes a param without mutating the source', () => {
        const source = new URLSearchParams('date=2026-11-10&ot=1');
        const withShift = withParam(source, 'shift', 's1');
        expect(withShift.get('shift')).toBe('s1');
        const withoutOt = withParam(source, 'ot', null);
        expect(withoutOt.has('ot')).toBe(false);
        expect(withoutOt.get('date')).toBe('2026-11-10');
        expect(source.toString()).toBe('date=2026-11-10&ot=1');
    });

    it('keeps year and month only for the monthly mode', () => {
        const source = new URLSearchParams('date=2026-11-10&year=1&month=2');
        const monthly = withViewMode(source, 'monthly', 2026, 11);
        expect(monthly.get('mode')).toBe('monthly');
        expect(monthly.get('year')).toBe('2026');
        expect(monthly.get('month')).toBe('11');
        for (const mode of ['daily', 'weekly'] as const) {
            const sp = withViewMode(source, mode, 2026, 11);
            expect(sp.get('mode')).toBe(mode);
            expect(sp.has('year')).toBe(false);
            expect(sp.has('month')).toBe(false);
            expect(sp.get('date')).toBe('2026-11-10');
        }
    });

    it('sets the changed period key before its partner', () => {
        const sp = withPeriod(new URLSearchParams('mode=monthly'), ['month', '3'], ['year', '2026']);
        expect(sp.toString()).toBe('mode=monthly&month=3&year=2026');
    });

    it('builds export links per mode', () => {
        const common = { year: 2026, month: 3, date: '2026-11-10', overtimeOnly: false };
        expect(buildExportHref({ ...common, viewMode: 'monthly' })).toBe(
            '/api/hrd/attendance/export?mode=monthly&year=2026&month=3',
        );
        expect(buildExportHref({ ...common, viewMode: 'weekly' })).toBe(
            '/api/hrd/attendance/export?mode=weekly&date=2026-11-10',
        );
        expect(buildExportHref({ ...common, viewMode: 'daily' })).toBe(
            '/api/hrd/attendance/export?mode=daily&date=2026-11-10',
        );
        expect(
            buildExportHref({ ...common, viewMode: 'daily', shift: 's1', overtimeOnly: true }),
        ).toBe('/api/hrd/attendance/export?mode=daily&date=2026-11-10&shift=s1&ot=1');
    });
});
