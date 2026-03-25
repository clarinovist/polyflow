export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    /**
     * Optional filter function to determine if an error is retryable.
     * By default, it retries on all errors.
     */
    shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    shouldRetry: () => true
};

/**
 * Utility for executing asynchronous operations with an exponential backoff retry strategy.
 * Useful for external API calls, like Gemini, Resend, or third-party webhooks that might rate limit.
 *
 * @param operation The async function to execute
 * @param options Custom options to override the backoff behavior
 * @returns The resolved data of the target operation
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    let attempt = 0;

    while (true) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            
            if (attempt > config.maxRetries || !config.shouldRetry(error)) {
                throw error;
            }

            // Exponential backoff: baseDelay * 2^attempt
            // with a little bit of jitter to avoid thunder herd problems
            const backoff = Math.min(
                config.baseDelayMs * Math.pow(2, attempt - 1),
                config.maxDelayMs
            );
            
            const jitter = Math.random() * 200; // ± 200ms
            const waitTime = backoff + jitter;

            console.warn(`[RetryUtil] Operation failed. Retrying attempt ${attempt}/${config.maxRetries} in ${Math.round(waitTime)}ms...`, error);

            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
    }
}
