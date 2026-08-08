import { describe, it, expect } from 'vitest';
import { parseRupiah, RUPIAH_MAX_VALUE } from '../rupiah-parse';

describe('parseRupiah', () => {
    describe('sufiks juta', () => {
        it('mem-parse "450jt" jadi 450 juta', () => {
            expect(parseRupiah('450jt')).toBe(450_000_000);
        });

        it('mem-parse "450 jt" (dengan spasi) jadi 450 juta', () => {
            expect(parseRupiah('450 jt')).toBe(450_000_000);
        });

        it('mem-parse "450juta" (sufiks penuh) jadi 450 juta', () => {
            expect(parseRupiah('450juta')).toBe(450_000_000);
        });
    });

    describe('sufiks miliar — ambiguitas koma vs titik', () => {
        it('mem-parse "2,5M" jadi 2.5 miliar (koma = desimal, M = miliar)', () => {
            // Arrange
            const raw = '2,5M';
            // Act
            const result = parseRupiah(raw);
            // Assert
            expect(result).toBe(2_500_000_000);
        });

        it('mem-parse "2.500.000.000" jadi 2.5 miliar (titik = ribuan, tanpa sufiks)', () => {
            // Arrange
            const raw = '2.500.000.000';
            // Act
            const result = parseRupiah(raw);
            // Assert
            expect(result).toBe(2_500_000_000);
        });

        it('mem-parse "2,5 miliar" (sufiks penuh, lowercase)', () => {
            expect(parseRupiah('2,5 miliar')).toBe(2_500_000_000);
        });

        it('mem-parse "1m" jadi 1 miliar', () => {
            expect(parseRupiah('1m')).toBe(1_000_000_000);
        });
    });

    describe('sufiks ribu', () => {
        it('mem-parse "500rb" jadi 500 ribu', () => {
            expect(parseRupiah('500rb')).toBe(500_000);
        });

        it('mem-parse "500 ribu" jadi 500 ribu', () => {
            expect(parseRupiah('500 ribu')).toBe(500_000);
        });
    });

    describe('tanpa sufiks — delegasi murni ke parseIndonesianPrice', () => {
        it('mem-parse angka polos', () => {
            expect(parseRupiah('450000000')).toBe(450_000_000);
        });

        it('mem-parse dengan prefix Rp', () => {
            expect(parseRupiah('Rp 1.000.000')).toBe(1_000_000);
        });
    });

    describe('input kotor', () => {
        it('menolak input berisi huruf sampah yang bukan sufiks dikenal', () => {
            expect(parseRupiah('450xyz')).toBeNull();
        });

        it('menolak input campur simbol tidak dikenal', () => {
            expect(parseRupiah('45!!0000')).toBeNull();
        });

        it('menolak string kosong', () => {
            expect(parseRupiah('')).toBeNull();
        });

        it('menolak whitespace saja', () => {
            expect(parseRupiah('   ')).toBeNull();
        });

        it('menolak null/undefined', () => {
            expect(parseRupiah(null)).toBeNull();
            expect(parseRupiah(undefined)).toBeNull();
        });
    });

    describe('negatif', () => {
        it('menolak angka negatif polos', () => {
            expect(parseRupiah('-450000')).toBeNull();
        });

        it('menolak sufiks dengan angka negatif', () => {
            expect(parseRupiah('-450jt')).toBeNull();
        });
    });

    describe('NaN / tidak bisa diparse', () => {
        it('menolak sufiks tanpa angka sama sekali', () => {
            expect(parseRupiah('jt')).toBeNull();
        });

        it('menolak huruf murni', () => {
            expect(parseRupiah('abc')).toBeNull();
        });
    });

    describe('batas atas wajar', () => {
        it('menerima nilai tepat di RUPIAH_MAX_VALUE', () => {
            expect(parseRupiah(String(RUPIAH_MAX_VALUE))).toBe(
                RUPIAH_MAX_VALUE,
            );
        });

        it('menolak nilai melebihi RUPIAH_MAX_VALUE', () => {
            expect(parseRupiah('9999m')).toBeNull();
        });
    });
});
