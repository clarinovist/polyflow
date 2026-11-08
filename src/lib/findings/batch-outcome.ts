const GENERIC_FAILURE = 'Terjadi kesalahan, coba lagi.';

export type BatchOutcome = {
    ok: number;
    failed: number;
    firstError: string | null;
};

type ActionResult = { success: boolean; error?: string };

/**
 * Folds the results of a group action (one server action per finding) into
 * counts. A server action reports business failures as `success: false`
 * rather than rejecting, so both shapes count as a failure.
 */
export function summarizeBatch(
    results: readonly PromiseSettledResult<ActionResult>[],
): BatchOutcome {
    let ok = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
            ok += 1;
            continue;
        }
        failed += 1;
        const message =
            result.status === 'fulfilled'
                ? result.value.error
                : undefined;
        firstError = firstError ?? message ?? GENERIC_FAILURE;
    }
    return { ok, failed, firstError };
}
