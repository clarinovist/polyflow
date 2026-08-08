import { describe, it, expect } from 'vitest';
import {
    expectedPacePercent,
    paceStatus,
    PACE_TIGHT_RATIO,
    PACE_RISK_RATIO,
} from '../target-pacing';

describe('expectedPacePercent', () => {
    it('mengembalikan pace rendah di awal bulan (hari ke-1 dari 30)', () => {
        // Arrange
        const periodStart = new Date(2026, 6, 1); // 1 Jul 2026
        const periodEnd = new Date(2026, 6, 31); // 31 Jul 2026
        const today = new Date(2026, 6, 1);
        // Act
        const result = expectedPacePercent(today, periodStart, periodEnd);
        // Assert — 1/31 hari
        expect(result).toBeCloseTo((1 / 31) * 100, 1);
    });

    it('mengembalikan ~50% di tengah bulan', () => {
        // Arrange: Juli 31 hari, tanggal 16 = hari ke-16
        const periodStart = new Date(2026, 6, 1);
        const periodEnd = new Date(2026, 6, 31);
        const today = new Date(2026, 6, 16);
        // Act
        const result = expectedPacePercent(today, periodStart, periodEnd);
        // Assert
        expect(result).toBeCloseTo((16 / 31) * 100, 1);
    });

    it('mengembalikan 100% di hari terakhir bulan', () => {
        const periodStart = new Date(2026, 6, 1);
        const periodEnd = new Date(2026, 6, 31);
        const today = new Date(2026, 6, 31);
        expect(expectedPacePercent(today, periodStart, periodEnd)).toBe(100);
    });

    it('mengembalikan 100% untuk periode lampau (bukan berdasarkan hari ini)', () => {
        // Arrange: today jauh setelah periodEnd
        const periodStart = new Date(2026, 0, 1);
        const periodEnd = new Date(2026, 0, 31);
        const today = new Date(2026, 7, 8);
        // Act
        const result = expectedPacePercent(today, periodStart, periodEnd);
        // Assert
        expect(result).toBe(100);
    });

    it('mengembalikan 0% untuk periode yang belum mulai', () => {
        const periodStart = new Date(2026, 11, 1);
        const periodEnd = new Date(2026, 11, 31);
        const today = new Date(2026, 7, 8);
        expect(expectedPacePercent(today, periodStart, periodEnd)).toBe(0);
    });

    it('tidak pernah melebihi 100 walau today == periodEnd tepat', () => {
        const periodStart = new Date(2026, 1, 1);
        const periodEnd = new Date(2026, 1, 28);
        const today = new Date(2026, 1, 28);
        const result = expectedPacePercent(today, periodStart, periodEnd);
        expect(result).toBeLessThanOrEqual(100);
    });
});

describe('paceStatus', () => {
    it('mengembalikan ON ketika rasio tepat di ambang PACE_TIGHT_RATIO', () => {
        // Arrange: 90/100 = 0.9 = PACE_TIGHT_RATIO persis
        const achievement = 90;
        const expected = 100;
        // Act
        const result = paceStatus(achievement, expected);
        // Assert
        expect(PACE_TIGHT_RATIO).toBe(0.9);
        expect(result).toBe('ON');
    });

    it('mengembalikan TIPIS ketika rasio di antara RISK dan TIGHT', () => {
        // Arrange: rasio 0.8 (antara 0.7 dan 0.9)
        const expected = 100;
        const achievement = 80;
        // Act
        const result = paceStatus(achievement, expected);
        // Assert
        expect(result).toBe('TIPIS');
    });

    it('mengembalikan RISIKO ketika rasio di bawah PACE_RISK_RATIO', () => {
        const expected = 100;
        const achievement = 50;
        expect(PACE_RISK_RATIO).toBe(0.7);
        expect(paceStatus(achievement, expected)).toBe('RISIKO');
    });

    it('mengembalikan ON untuk achievement >100% (overachiever, tidak clamp)', () => {
        // Arrange
        const expected = 50;
        const achievement = 150;
        // Act
        const result = paceStatus(achievement, expected);
        // Assert
        expect(result).toBe('ON');
    });

    it('mengembalikan ON ketika expected 0 (awal periode, belum ada dasar telat)', () => {
        expect(paceStatus(0, 0)).toBe('ON');
        expect(paceStatus(10, 0)).toBe('ON');
    });

    it('mengembalikan RISIKO ketika achievement null (tidak ada target)', () => {
        expect(paceStatus(null, 50)).toBe('RISIKO');
    });

    it('target 0 (expected dari pemanggil tetap bisa dihitung, tidak melempar)', () => {
        // achievementPercent null merepresentasikan "tidak ada target" dari
        // target-service (calcAchievementPercent kembalikan null saat target 0)
        expect(paceStatus(null, 0)).toBe('RISIKO');
    });
});
