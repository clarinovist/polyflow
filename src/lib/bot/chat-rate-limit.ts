/**
 * Rate limiter bersama untuk endpoint chat asisten.
 *
 * WAJIB dipakai oleh SEMUA endpoint chat (`/api/chat` dan `/api/chat/stream`).
 * Kalau tiap endpoint punya peta sendiri, batas 20/menit bisa ditembus jadi
 * 40/menit hanya dengan berganti endpoint — bypass yang tidak kelihatan di test
 * per-endpoint karena masing-masing tampak patuh.
 *
 * Catatan: in-memory, jadi batasnya per-instance. Cukup untuk deployment
 * single-container saat ini; kalau app di-scale horizontal, pindahkan ke Redis.
 */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

/** Return true bila request boleh lanjut; false bila kuota habis. */
export function checkChatRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT) {
        return false;
    }

    entry.count++;
    return true;
}

/** Reset seluruh state — hanya untuk test. */
export function __resetChatRateLimit(): void {
    rateLimitMap.clear();
}
