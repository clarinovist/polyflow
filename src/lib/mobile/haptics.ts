/**
 * Getar singkat sebagai penanda aksi berhasil. Berguna di lantai pabrik yang
 * bising. Hanya Android/Chrome yang mendukung `navigator.vibrate`; di iOS
 * Safari dan desktop fungsi ini no-op. Tidak pernah melempar error.
 */
export const HAPTIC_SUCCESS_MS = 15;

export function hapticSuccess(): void {
    if (typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate !== 'function') return;
    try {
        navigator.vibrate(HAPTIC_SUCCESS_MS);
    } catch {
        // Beberapa browser menolak vibrate tanpa gestur pengguna; abaikan.
    }
}
