const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;
/**
 * Calculate exponential backoff delay with jitter.
 */
export function calculateBackoff(attempt: number): number {
    const exponential = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, attempt),
        MAX_BACKOFF_MS,
    );
    // Add jitter: ±20%
    const jitter = exponential * 0.2 * (Math.random() * 2 - 1);
    return Math.round(exponential + jitter);
}

/**
 * Determine if an error is permanent (4xx) vs retryable (5xx/network).
 */
export function isPermanentError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;
        return status >= 400 && status < 500;
    }
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('permission') || msg.includes('unauthorized'))
            return true;
        if (msg.includes('forbidden')) return true;
        if (msg.includes('not found')) return true;
    }
    return false;
}