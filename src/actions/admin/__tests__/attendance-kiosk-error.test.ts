import { describe, it, expect } from 'vitest';
import { mapKioskError } from '../attendance';

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
