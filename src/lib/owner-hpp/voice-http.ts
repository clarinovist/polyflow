export type VoiceHttpFailure = 'timeout' | 'network';

export class VoiceHttpError extends Error {
    readonly kind: VoiceHttpFailure;

    constructor(kind: VoiceHttpFailure) {
        super(kind);
        this.name = 'VoiceHttpError';
        this.kind = kind;
    }
}

export type FetchLike = (
    input: string,
    init?: RequestInit,
) => Promise<Response>;

const SERVER_ERROR_FROM = 500;

interface FetchPolicy {
    timeoutMs: number;
    /** Extra attempts after the first one. */
    retries: number;
}

async function fetchOnce(
    fetchImpl: FetchLike,
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
        throw new VoiceHttpError(
            controller.signal.aborted ? 'timeout' : 'network',
        );
    } finally {
        clearTimeout(timer);
    }
}

/**
 * One request with a hard timeout. A network failure or a 5xx is retried;
 * a timeout or a 4xx is final (retrying would double the wait / repeat a bad call).
 */
export async function fetchWithRetry(
    fetchImpl: FetchLike,
    url: string,
    init: RequestInit,
    policy: FetchPolicy,
): Promise<Response> {
    let lastError: VoiceHttpError | null = null;
    for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
        try {
            const response = await fetchOnce(
                fetchImpl,
                url,
                init,
                policy.timeoutMs,
            );
            const isLast = attempt === policy.retries;
            if (response.status >= SERVER_ERROR_FROM && !isLast) continue;
            return response;
        } catch (error) {
            if (
                !(error instanceof VoiceHttpError) ||
                error.kind === 'timeout'
            ) {
                throw error;
            }
            lastError = error;
        }
    }
    throw lastError ?? new VoiceHttpError('network');
}
