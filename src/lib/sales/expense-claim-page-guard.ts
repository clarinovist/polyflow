import { redirect } from 'next/navigation';
import { withTenant } from '@/lib/core/tenant';
import { BusinessRuleError } from '@/lib/errors/errors';
import { UNAUTHORIZED_REDIRECT_PATH } from '@/lib/sales/expense-claim-review';

/**
 * Runs the same role check the actions use (e.g. `requireSalesManager`) and
 * redirects when it rejects. Only the authorization error is translated; any
 * other failure still surfaces. `redirect` is called outside the try block
 * because it works by throwing.
 */
export async function guardClaimPage(
    check: () => Promise<unknown>,
): Promise<void> {
    const authorize = withTenant(async function authorize() {
        await check();
    });
    let isDenied = false;
    try {
        await authorize();
    } catch (error) {
        if (!(error instanceof BusinessRuleError)) throw error;
        isDenied = true;
    }
    if (isDenied) redirect(UNAUTHORIZED_REDIRECT_PATH);
}
