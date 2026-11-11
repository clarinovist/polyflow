import { describe, it, expect } from 'vitest';
import {
    MONTH_NAMES,
    formatDistance,
    formatHours,
    formatIdr,
    formatTime,
    sourceBadgeClass,
    sourceLabel,
    toWibInput,
    weekLabel,
} from '../attendance-format';

describe('attendance-format', () => {
    it('lists twelve Indonesian month names', () => {
        expect(MONTH_NAMES).toHaveLength(12);
        expect(MONTH_NAMES[0]).toBe('Januari');
        expect(MONTH_NAMES[11]).toBe('Desember');
    });

    it('labels known sources and passes unknown ones through', () => {
        expect(sourceLabel('KIOSK')).toBe('Kiosk');
        expect(sourceLabel('SELF_SERVICE')).toBe('Mandiri');
        expect(sourceLabel('MANUAL')).toBe('Manual');
        expect(sourceLabel('IMPORT')).toBe('IMPORT');
    });

    it('picks a badge class per source with kiosk-style default', () => {
        expect(sourceBadgeClass('SELF_SERVICE')).toContain('blue');
        expect(sourceBadgeClass('MANUAL')).toContain('amber');
        expect(sourceBadgeClass('KIOSK')).toContain('emerald');
        expect(sourceBadgeClass('OTHER')).toContain('emerald');
    });

    it('formats rupiah without decimals', () => {
        expect(formatIdr(550000)).toMatch(/550\.000/);
        expect(formatIdr(550000)).toMatch(/Rp/);
    });

    it('formats a week range in UTC with an en dash', () => {
        const label = weekLabel(
            new Date('2026-11-09T00:00:00.000Z'),
            new Date('2026-11-15T00:00:00.000Z'),
        );
        expect(label).toContain('–');
        expect(label).toContain('2026');
    });

    it('formats clock times in WIB and dashes for empty values', () => {
        expect(formatTime('2026-11-10T00:00:00.000Z')).toBe('07.00');
        expect(formatTime(new Date('2026-11-10T08:30:00.000Z'))).toBe('15.30');
        expect(formatTime(null)).toBe('-');
    });

    it('formats hours with one decimal and dashes for null', () => {
        expect(formatHours(8)).toBe('8.0j');
        expect(formatHours(1.25)).toBe('1.3j');
        expect(formatHours(null)).toBe('-');
    });

    it('formats distance in meters below 1 km and km above', () => {
        expect(formatDistance(249.6)).toBe('250m');
        expect(formatDistance(999)).toBe('999m');
        expect(formatDistance(1000)).toBe('1.0km');
        expect(formatDistance(1540)).toBe('1.5km');
    });

    it('renders datetime-local values in WIB from strings and dates', () => {
        expect(toWibInput('2026-11-10T00:00:00.000Z')).toBe('2026-11-10T07:00');
        expect(toWibInput(new Date('2026-11-10T20:30:00.000Z'))).toBe(
            '2026-11-11T03:30',
        );
    });
});
