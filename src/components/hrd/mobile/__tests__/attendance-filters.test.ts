import { describe, expect, it } from 'vitest';
import {
    buildAttendanceHref,
    describePageRange,
    employeeRoleLabel,
    parseAttendanceStatus,
} from '../attendance-filters';

describe('parseAttendanceStatus', () => {
    it.each(['PRESENT', 'ABSENT', 'ON_LEAVE', 'NO_RECORD', 'LATE', 'ALL'])(
        'accepts the valid status %s',
        (status) => {
            expect(parseAttendanceStatus(status)).toBe(status);
        },
    );

    it.each([undefined, '', 'present', 'BAD', 'ALL;DROP', ' PRESENT'])(
        'falls back to ALL for %s',
        (status) => {
            expect(parseAttendanceStatus(status)).toBe('ALL');
        },
    );
});

describe('buildAttendanceHref', () => {
    it('omits default values and page 1', () => {
        expect(buildAttendanceHref({ status: 'ALL' }, 1)).toBe(
            '/hrd/mobile/attendance',
        );
    });

    it('keeps applied filters and the requested page', () => {
        const href = buildAttendanceHref(
            { date: '2026-09-23', workShiftId: 's1', status: 'LATE', q: 'a b' },
            3,
        );
        const params = new URL(href, 'http://x').searchParams;
        expect(params.get('date')).toBe('2026-09-23');
        expect(params.get('shift')).toBe('s1');
        expect(params.get('status')).toBe('LATE');
        expect(params.get('q')).toBe('a b');
        expect(params.get('page')).toBe('3');
    });
});

describe('describePageRange', () => {
    it('formats x-y of N', () => {
        expect(describePageRange(2, 20, 20, 45)).toBe('21–40 dari 45');
    });

    it('reports an empty result', () => {
        expect(describePageRange(1, 20, 0, 0)).toBe('0 dari 0');
    });
});

describe('employeeRoleLabel', () => {
    it('humanises raw role codes', () => {
        expect(employeeRoleLabel('OPERATOR')).toBe('Operator');
        expect(employeeRoleLabel('FACTORY_MANAGER')).toBe('Manajer Pabrik');
        expect(employeeRoleLabel('QUALITY_CONTROL')).toBe('Quality Control');
    });

    it('returns a dash for empty roles', () => {
        expect(employeeRoleLabel('')).toBe('-');
    });
});
