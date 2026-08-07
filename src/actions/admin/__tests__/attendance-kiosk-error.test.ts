import { describe, it, expect } from 'vitest';
import { mapKioskError } from '../attendance';
import { parseKioskLocationEvidence } from '@/services/hrd/kiosk-location-evidence';

describe('mapKioskError', () => {
    it('returns generic error when error is not an Error instance', async () => {
        expect(await mapKioskError('some string')).toBe('Terjadi kesalahan pada sistem absensi');
    });

    it('maps PIN error correctly', async () => {
        expect(await mapKioskError(new Error('PIN salah'))).toBe('PIN yang Anda masukkan salah');
    });

    it('maps inactive employee error correctly', async () => {
        expect(await mapKioskError(new Error('Karyawan tidak aktif'))).toBe('Akun karyawan sedang tidak aktif');
    });

    it('maps non-existent employee error correctly', async () => {
        expect(await mapKioskError(new Error('Karyawan tidak ditemukan'))).toBe('Data karyawan tidak ditemukan');
    });

    it('maps inactive shift error correctly', async () => {
        expect(await mapKioskError(new Error('Shift tidak aktif'))).toBe('Shift kerja tidak aktif');
    });

    it('maps no active shift error correctly', async () => {
        expect(await mapKioskError(new Error('Tidak ada shift aktif terdaftar di sistem.'))).toBe('Tidak ada shift kerja aktif terdaftar');
    });

    it('passes through open session message', async () => {
        const msg = 'Masih belum clock-out shift Shift 1. Pulang dulu sebelum masuk shift berikutnya.';
        expect(await mapKioskError(new Error(msg))).toBe(msg);
    });

    it('maps selfie photo error', async () => {
        expect(await mapKioskError(new Error('Foto absensi tidak valid'))).toBe('Ambil selfie terlebih dahulu');
    });
});

describe('parseKioskLocationEvidence', () => {
    it('passes through undefined as undefined (no GPS sent)', () => {
        const result = parseKioskLocationEvidence(undefined);
        expect(result).toEqual({ success: true, data: undefined });
    });

    it('treats null the same as undefined', () => {
        const result = parseKioskLocationEvidence(null);
        expect(result).toEqual({ success: true, data: undefined });
    });

    it('accepts a valid location payload', () => {
        const valid = { latitude: -6.2, longitude: 106.8, accuracy: 15 };
        const result = parseKioskLocationEvidence(valid);
        expect(result).toEqual({ success: true, data: valid });
    });

    it('rejects latitude out of range', () => {
        const result = parseKioskLocationEvidence({
            latitude: 200,
            longitude: 106.8,
            accuracy: 15,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('lokasi GPS tidak valid');
        }
    });

    it('rejects longitude out of range', () => {
        const result = parseKioskLocationEvidence({
            latitude: -6.2,
            longitude: 999,
            accuracy: 15,
        });
        expect(result.success).toBe(false);
    });

    it('rejects non-positive accuracy', () => {
        const result = parseKioskLocationEvidence({
            latitude: -6.2,
            longitude: 106.8,
            accuracy: 0,
        });
        expect(result.success).toBe(false);
    });

    it('rejects non-finite numbers (NaN/Infinity)', () => {
        const result = parseKioskLocationEvidence({
            latitude: NaN,
            longitude: 106.8,
            accuracy: 15,
        });
        expect(result.success).toBe(false);
    });

    it('rejects malformed payloads that are not a valid shape', () => {
        const result = parseKioskLocationEvidence({
            latitude: 'not-a-number',
            longitude: 106.8,
            accuracy: 15,
        });
        expect(result.success).toBe(false);
    });

    it('rejects a bare string instead of an object', () => {
        const result = parseKioskLocationEvidence('gps');
        expect(result.success).toBe(false);
    });
});
