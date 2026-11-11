import { describe, expect, it } from 'vitest';
import {
    attendanceStatusLabel,
    leaveStatusLabel,
} from '../attendance-status-label';

describe('attendanceStatusLabel', () => {
    it.each([
        ['PRESENT', 'Hadir'],
        ['ABSENT', 'Alfa'],
        ['ON_LEAVE', 'Izin'],
    ])('maps %s to %s', (status, label) => {
        expect(attendanceStatusLabel(status)).toBe(label);
    });

    it('returns unknown statuses unchanged', () => {
        expect(attendanceStatusLabel('HOLIDAY')).toBe('HOLIDAY');
    });
});

describe('leaveStatusLabel', () => {
    it.each([
        ['PENDING', 'Menunggu'],
        ['APPROVED', 'Disetujui'],
        ['REJECTED', 'Ditolak'],
    ])('maps %s to %s', (status, label) => {
        expect(leaveStatusLabel(status)).toBe(label);
    });

    it('returns unknown statuses unchanged', () => {
        expect(leaveStatusLabel('CANCELLED')).toBe('CANCELLED');
    });
});
