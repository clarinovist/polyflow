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
const acceptedRequests = new Map<string, number>();

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

/** Return true bila request boleh lanjut; false bila kuota habis. */
export function checkChatRateLimit(
    userId: string,
    requestId?: string,
): boolean {
    const now = Date.now();
    const dedupeKey = requestId ? `${userId}:${requestId}` : undefined;
    if (dedupeKey) {
        const acceptedUntil = acceptedRequests.get(dedupeKey);
        if (acceptedUntil && acceptedUntil >= now) return true;
        if (acceptedUntil) acceptedRequests.delete(dedupeKey);
    }
    const entry = rateLimitMap.get(userId);

    if (!entry || now > entry.resetAt) {
        const resetAt = now + RATE_WINDOW_MS;
        rateLimitMap.set(userId, { count: 1, resetAt });
        if (dedupeKey) acceptedRequests.set(dedupeKey, resetAt);
        return true;
    }

    if (entry.count >= RATE_LIMIT) {
        return false;
    }

    entry.count++;
    if (dedupeKey) acceptedRequests.set(dedupeKey, entry.resetAt);
    return true;
}

/** Reset seluruh state — hanya untuk test. */
export function __resetChatRateLimit(): void {
    rateLimitMap.clear();
    acceptedRequests.clear();
}
