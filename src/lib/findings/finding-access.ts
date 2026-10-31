import { isPathAllowedByResources } from '@/lib/auth/access-policy';

/**
 * A user may see/act on a finding iff they could open at least one of the
 * finding's resource pages. Uses the same prefix semantics as the app's
 * route guard (`/finance` grants `/finance/invoices`; `'ALL'` grants all).
 */
export function canSeeFinding(
    allowed: string[] | 'ALL',
    requiredResources: readonly string[],
): boolean {
    if (allowed === 'ALL') return true;
    return requiredResources.some((resource) =>
        isPathAllowedByResources(resource, allowed),
    );
}
