/**
 * Offline sync engine — processes queued commands when online.
 *
 * Handles retry with exponential backoff, permanent failure detection,
 * and idempotency via command ID.
 *
 * @see docs/plan/2026-07-28-mobile-scope-strategy.md §6.6
 */

import {
    getCommands,
    updateCommand,
    deleteCommand,
} from '@/lib/mobile/offline-store';
import { getCommandDef } from '@/lib/mobile/offline-command-registry';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;

export interface SyncResult {
    processed: number;
    succeeded: number;
    failed: number;
    permanentFailures: number;
}

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

/**
 * Process all queued commands for a tenant+user.
 * Called when the device comes back online.
 */
export async function processSyncQueue(
    tenantId: string,
    userId: string,
): Promise<SyncResult> {
    const result: SyncResult = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        permanentFailures: 0,
    };

    const queued = await getCommands(tenantId, userId, 'QUEUED');
    const now = new Date();

    for (const command of queued) {
        // Check if command is ready for retry (backoff delay)
        if (command.nextAttemptAt) {
            const nextAttempt = new Date(command.nextAttemptAt);
            if (nextAttempt > now) continue;
        }

        result.processed++;

        // Check if command type is still registered
        const def = getCommandDef(command.type);
        if (!def) {
            // Unknown command — mark as permanent failure
            await updateCommand(command.id, {
                status: 'FAILED',
                lastError: `Command type "${command.type}" is not registered`,
            });
            result.permanentFailures++;
            continue;
        }

        // Mark as syncing
        await updateCommand(command.id, { status: 'SYNCING' });

        try {
            await def.execute(command.payload);
            // Success — delete from queue
            await deleteCommand(command.id);
            result.succeeded++;
        } catch (error) {
            const attempts = command.attempts + 1;

            if (isPermanentError(error) || attempts >= MAX_RETRIES) {
                // Permanent failure or max retries exceeded
                await updateCommand(command.id, {
                    status: 'FAILED',
                    attempts,
                    lastError:
                        error instanceof Error
                            ? error.message
                            : String(error),
                });
                result.permanentFailures++;
            } else {
                // Retryable — calculate backoff and requeue
                const backoff = calculateBackoff(attempts);
                const nextAttemptAt = new Date(
                    Date.now() + backoff,
                ).toISOString();
                await updateCommand(command.id, {
                    status: 'QUEUED',
                    attempts,
                    nextAttemptAt,
                    lastError:
                        error instanceof Error
                            ? error.message
                            : String(error),
                });
                result.failed++;
            }
        }
    }

    return result;
}

/**
 * Manually retry a failed command (reset status to QUEUED).
 */
export async function retryFailedCommand(
    commandId: string,
): Promise<void> {
    await updateCommand(commandId, {
        status: 'QUEUED',
        attempts: 0,
        nextAttemptAt: undefined,
        lastError: undefined,
    });
}

/**
 * Discard a failed command (delete from queue).
 */
export async function discardFailedCommand(
    commandId: string,
): Promise<void> {
    await deleteCommand(commandId);
}
