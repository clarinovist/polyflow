import { describe, it, expect } from 'vitest';
import { parseDecimalInput } from '../decimal-input';

describe('parseDecimalInput', () => {
    describe('input desimal bertitik (format standar JS)', () => {
        it('mengembalikan angka untuk input desimal bertitik', () => {
            // Arrange
            const raw = '45.3';
            // Act
            const result = parseDecimalInput(raw);
            // Assert
            expect(result).toBe(45.3);
        });

        it('mengembalikan angka bulat', () => {
            expect(parseDecimalInput('100')).toBe(100);
            expect(parseDecimalInput('0')).toBe(0);
        });

        it('menerima nol dengan desimal eksplisit', () => {
            expect(parseDecimalInput('0.0')).toBe(0);
        });
    });

    describe('koma sebagai pemisah desimal (inti masalahnya)', () => {
        it('memperlakukan koma sebagai pemisah desimal', () => {
            // Arrange — operator Indonesia mengetik 45,3 untuk 45,3 kg
            // Act
            const result = parseDecimalInput('45,3');
            // Assert — parseFloat('45,3') would give 45, this must give 45.3
            expect(result).toBe(45.3);
        });

        it('memperlakukan koma dengan trimming', () => {
            expect(parseDecimalInput('  45,3  ')).toBe(45.3);
        });

        it('menerima 0,5 sebagai 0.5', () => {
            expect(parseDecimalInput('0,5')).toBe(0.5);
        });
    });

    describe('string kosong / whitespace', () => {
        it('mengembalikan null untuk string kosong', () => {
            expect(parseDecimalInput('')).toBeNull();
        });

        it('mengembalikan null untuk spasi saja', () => {
            expect(parseDecimalInput('   ')).toBeNull();
        });

        it('mengembalikan null untuk tab / newline', () => {
            expect(parseDecimalInput('\t')).toBeNull();
            expect(parseDecimalInput(' \n\t ')).toBeNull();
        });
    });

    describe('input non-numerik', () => {
        it('mengembalikan null untuk input non-numerik', () => {
            expect(parseDecimalInput('abc')).toBeNull();
            expect(parseDecimalInput('12kg')).toBeNull();
            expect(parseDecimalInput('NaN')).toBeNull();
            expect(parseDecimalInput('Infinity')).toBeNull();
            expect(parseDecimalInput('--Infinity')).toBeNull();
        });

        it('mengembalikan null untuk campuran huruf dan angka', () => {
            expect(parseDecimalInput('12a34')).toBeNull();
            expect(parseDecimalInput('kg45')).toBeNull();
        });
    });

    describe('negatif', () => {
        it('mengembalikan null untuk nilai negatif', () => {
            expect(parseDecimalInput('-5')).toBeNull();
            expect(parseDecimalInput('-0.5')).toBeNull();
            expect(parseDecimalInput('-45,3')).toBeNull();
        });

        it('mengembalikan null untuk tanda plus juga', () => {
            // Tanda plus di dalamnya juga bukan angka valid untuk konteks fisik
            expect(parseDecimalInput('+5')).toBeNull();
        });
    });

    describe('pemisah desimal ganda', () => {
        it('mengembalikan null untuk pemisah desimal ganda', () => {
            expect(parseDecimalInput('1,2,3')).toBeNull();
            expect(parseDecimalInput('1.2.3')).toBeNull();
            expect(parseDecimalInput('1,,2')).toBeNull();
            expect(parseDecimalInput('1..2')).toBeNull();
        });
    });

    describe('pemisah ribuan bergaya Indonesia', () => {
        it('menangani pemisah ribuan bergaya Indonesia', () => {
            // 1.234,5 → 1234.5 (titik sebagai ribuan, koma sebagai desimal)
            expect(parseDecimalInput('1.234,5')).toBe(1234.5);
        });

        it('menangani beberapa titik ribuan + koma desimal', () => {
            expect(parseDecimalInput('1.234.567,89')).toBe(1234567.89);
        });

        it('memperlakukan titik tunggal sebagai desimal jika ambigu (1.234)', () => {
            // Alasan: angka timbangan lebih sering desimal daripada ribuan
            expect(parseDecimalInput('1.234')).toBe(1.234);
        });

        it('mengembalikan null jika koma ganda walau ada titik', () => {
            expect(parseDecimalInput('1,234,5')).toBeNull();
            // titik + dua koma: cabang Indonesia dengan koma !=1
            expect(parseDecimalInput('1.234,5,6')).toBeNull();
        });

        it('menangani format ribuan US fallback 1,234.5 → 1234.5', () => {
            expect(parseDecimalInput('1,234.5')).toBe(1234.5);
        });

        it('menangani beberapa koma ribuan US + titik desimal', () => {
            expect(parseDecimalInput('1,234,567.89')).toBe(1234567.89);
        });

        it('mengembalikan null jika titik ganda pada format US (1,234.5.6)', () => {
            expect(parseDecimalInput('1,234.5.6')).toBeNull();
        });
    });

    describe('edge cases tambahan', () => {
        it('mengembalikan null untuk titik saja atau koma saja', () => {
            expect(parseDecimalInput('.')).toBeNull();
            expect(parseDecimalInput(',')).toBeNull();
        });

        it('menerima nilai kecil seperti 0,001', () => {
            expect(parseDecimalInput('0,001')).toBe(0.001);
        });
    });
});
