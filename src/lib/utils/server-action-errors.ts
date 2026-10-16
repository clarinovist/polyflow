/**
 * Turns a thrown Server Action failure into a user-facing message.
 *
 * A deploy replaces the server's action IDs, so a tab that was opened before
 * the deploy fails with "Failed to find Server Action". Operators previously
 * read that as "the operation is broken", which hid the real blocker behind a
 * stale page. Surface the recoverable cause instead of a generic failure.
 */
export interface ServerActionFailure {
    message: string;
    isStaleDeploy: boolean;
    isNetworkError: boolean;
}

export function describeServerActionFailure(
    error: unknown,
    fallback: string,
): ServerActionFailure {
    const raw = error instanceof Error ? error.message : String(error ?? '');

    if (raw.includes('Failed to find Server Action')) {
        return {
            message:
                'Halaman ini masih memakai versi aplikasi lama karena baru ada pembaruan. Muat ulang halaman (F5) lalu coba lagi.',
            isStaleDeploy: true,
            isNetworkError: false,
        };
    }

    if (/fetch|network|NetworkError/i.test(raw)) {
        return {
            message: 'Koneksi gagal. Cek koneksi internet lalu coba lagi.',
            isStaleDeploy: false,
            isNetworkError: true,
        };
    }

    return {
        message: fallback,
        isStaleDeploy: false,
        isNetworkError: false,
    };
}
