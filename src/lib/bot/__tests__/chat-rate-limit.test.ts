import { describe, expect, it, beforeEach } from 'vitest';
import {
    checkChatRateLimit,
    __resetChatRateLimit,
} from '../chat-rate-limit';

/**
 * Limiter ini WAJIB dipakai bersama oleh /api/chat dan /api/chat/stream.
 * Kalau tiap endpoint punya peta sendiri, batas 20/menit bisa ditembus jadi
 * 40/menit hanya dengan berganti endpoint — dan test per-endpoint tetap hijau
 * karena masing-masing tampak patuh. Modul bersama inilah kontraknya.
 */
describe('checkChatRateLimit', () => {
    beforeEach(() => {
        __resetChatRateLimit();
    });

    it('mengizinkan 20 request pertama', () => {
        for (let i = 0; i < 20; i++) {
            expect(checkChatRateLimit('user-1')).toBe(true);
        }
    });

    it('menolak request ke-21 dalam jendela yang sama', () => {
        for (let i = 0; i < 20; i++) checkChatRateLimit('user-1');
        expect(checkChatRateLimit('user-1')).toBe(false);
    });

    it('menghitung kuota per user, bukan global', () => {
        for (let i = 0; i < 20; i++) checkChatRateLimit('user-1');
        expect(checkChatRateLimit('user-1')).toBe(false);
        expect(checkChatRateLimit('user-2')).toBe(true);
    });

    it('kuota dibagi lintas endpoint (state modul, bukan per-route)', () => {
        // Simulasi: 15 request lewat /api/chat, 5 lewat /api/chat/stream.
        // Keduanya memanggil fungsi yang sama, jadi total 20 → ke-21 ditolak.
        for (let i = 0; i < 15; i++) checkChatRateLimit('user-3');
        for (let i = 0; i < 5; i++) checkChatRateLimit('user-3');
        expect(checkChatRateLimit('user-3')).toBe(false);
    });
});
