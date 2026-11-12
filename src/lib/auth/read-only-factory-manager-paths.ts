/**
 * Pure path matcher for the read-only Kepala Pabrik (FACTORY_MANAGER without
 * ADMIN) sub-route denial. Deliberately has NO imports so client components
 * (sidebar) can use it without pulling in the access policy and the module
 * registry.
 *
 * Routes that stay closed even though a broader grant covers them by prefix:
 * `/dashboard` must not open master-data sub-routes, `/warehouse/inventory`
 * must not open stock adjustment/transfer, and `/purchasing/orders` must not
 * open PO create/edit (those forms expose and write purchase prices).
 */
const READ_ONLY_FACTORY_MANAGER_DENIED_PREFIXES: readonly string[] = [
    '/dashboard',
    '/warehouse/inventory/adjustment',
    '/warehouse/inventory/transfer',
    '/purchasing/orders/create',
];
const PURCHASE_ORDER_EDIT_PATH = /^\/purchasing\/orders\/[^/]+\/edit(\/|$)/;

/** Decode rounds that catch double-encoding (`%2565` -> `%65` -> `e`). */
const MAX_DECODE_ROUNDS = 2;

function stripTrailingSlashes(pathname: string): string {
    return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function safeDecode(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

/**
 * Decodes until stable (at most MAX_DECODE_ROUNDS). Returns null when the
 * value cannot be decoded, or is still changing after the last round, so the
 * caller can fail closed.
 */
function decodeUntilStable(pathname: string): string | null {
    let current = pathname;
    for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
        const decoded = safeDecode(current);
        if (decoded === null) return null;
        if (decoded === current) return current;
        current = decoded;
    }
    // A further decode must be a no-op, otherwise the path is nested deeper
    // than we are willing to resolve.
    return safeDecode(current) === current ? current : null;
}

function normalizePath(pathname: string): string | null {
    const decoded = decodeUntilStable(pathname);
    if (decoded === null) return null;
    return stripTrailingSlashes(decoded.replace(/\/{2,}/g, '/')).toLowerCase();
}

/**
 * Normalises (percent-decoding, duplicate slashes, trailing slash, case)
 * before matching. Malformed or over-encoded input is DENIED (fail-closed);
 * callers only apply this to read-only Kepala Pabrik. `/dashboard` itself
 * stays open; its sub-routes do not.
 */
export function isPathDeniedForReadOnlyFactoryManager(
    pathname: string,
): boolean {
    const path = normalizePath(pathname);
    if (path === null) return true;
    if (PURCHASE_ORDER_EDIT_PATH.test(path)) return true;
    return READ_ONLY_FACTORY_MANAGER_DENIED_PREFIXES.some((prefix) =>
        prefix === '/dashboard'
            ? path.startsWith('/dashboard/')
            : path === prefix || path.startsWith(`${prefix}/`),
    );
}
