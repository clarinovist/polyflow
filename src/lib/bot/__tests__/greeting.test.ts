import { describe, expect, it } from 'vitest';
import { detectGreeting } from '../greeting';

describe('detectGreeting', () => {
    describe('mengenali sapaan murni', () => {
        it.each([
            'halo',
            'Halo',
            'hai',
            'hi',
            'pagi',
            'selamat pagi',
            'assalamualaikum',
            'permisi',
            'halo mau tanya dong',
            'hai min',
            'halo pak',
            'test',
        ])('menganggap %j sebagai sapaan', (input) => {
            expect(detectGreeting(input).isGreeting).toBe(true);
        });

        it('mengembalikan balasan berisi contoh pertanyaan', () => {
            const result = detectGreeting('halo');
            expect(result.reply).toContain('Asisten Kerja Polyflow');
            expect(result.suggestions).toHaveLength(3);
            // Balasan harus memuat contoh konkret, bukan cuma basa-basi.
            expect(result.reply).toContain('Cek stok barang MP 15 di gudang');
        });

        it('menyapa dengan nama bila tersedia', () => {
            expect(detectGreeting('halo', 'Filia').reply).toContain(
                'Halo, Filia!',
            );
        });

        it('tetap sopan tanpa nama', () => {
            expect(detectGreeting('halo').reply).toContain('Halo!');
        });
    });

    describe('melepaskan pesan yang mengandung pertanyaan nyata', () => {
        it.each([
            'halo, kenapa SO belum bisa dikirim',
            'halo mau tanya stok MP 15',
            'pagi, cara input hasil produksi gimana?',
            'hai apakah invoice sudah dibayar',
            'stok barang MP 15 kok tidak bisa dipakai buat SO?',
            'kenapa pesanan Budi belum bisa dikirim?',
        ])('melepaskan %j ke jalur agentic', (input) => {
            expect(detectGreeting(input).isGreeting).toBe(false);
        });

        it('melepaskan pesan dengan tanda tanya walau pendek', () => {
            expect(detectGreeting('halo?').isGreeting).toBe(false);
        });

        it('melepaskan pesan yang memuat angka (kemungkinan nomor transaksi)', () => {
            expect(detectGreeting('halo SO 123').isGreeting).toBe(false);
        });

        it('melepaskan pesan panjang walau diawali sapaan', () => {
            const long =
                'halo saya ingin menanyakan mengenai status pengiriman kemarin';
            expect(detectGreeting(long).isGreeting).toBe(false);
        });

        it('melepaskan string kosong', () => {
            expect(detectGreeting('').isGreeting).toBe(false);
            expect(detectGreeting('   ').isGreeting).toBe(false);
        });

        it('melepaskan kalimat tanpa kata sapaan sama sekali', () => {
            expect(detectGreeting('cek stok').isGreeting).toBe(false);
        });
    });
});
