import { prisma } from '@/lib/core/prisma';
import { hasAnyRole } from '@/lib/auth/roles';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    getFieldSalesScope,
    scopedInvoiceWhere,
} from '@/services/sales/field-scope';
import type { AssertInvoiceAccess } from './action-proposal-service';

const SALES_ACCESS_ROLES = ['ADMIN', 'SALES', 'MARKETING'];

/**
 * Invoice access guard for assistant write proposals, derived from the bound
 * authority (no session). Mirrors requireSalesAccess + assertInvoiceInScope in
 * the collection server action: sales roles only, SALES limited to own scope.
 */
export function buildInvoiceAccessGuard(actor: {
    userId: string;
    roles: string[];
}): AssertInvoiceAccess {
    return async (invoiceId) => {
        const user = { id: actor.userId, roles: actor.roles };
        if (!hasAnyRole(user, SALES_ACCESS_ROLES)) {
            throw new BusinessRuleError(
                'Unauthorized: Akses sales hanya untuk admin atau sales.',
            );
        }
        const scope = getFieldSalesScope({ user });
        const count = await prisma.invoice.count({
            where: { id: invoiceId, ...scopedInvoiceWhere(scope) },
        });
        if (count === 0) throw new NotFoundError('Invoice', invoiceId);
    };
}
