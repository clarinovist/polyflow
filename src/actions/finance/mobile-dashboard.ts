'use server';

import { getMyExplicitFeaturePermissions } from '@/actions/admin/permissions';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import {
    BusinessRuleError,
    safeAction,
    ValidationError,
} from '@/lib/errors/errors';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import {
    FINANCE_MOBILE_BUCKETS,
    FINANCE_MOBILE_DUE_FILTERS,
    FINANCE_MOBILE_TYPES,
    readFinanceMobileInvoiceDetail,
    readFinanceMobileOverview,
    type FinanceMobileBucket,
    type FinanceMobileDueFilter,
    type FinanceMobileType,
} from '@/services/finance/mobile-finance-service';

function includes<T extends string>(
    values: readonly T[],
    value: string | undefined,
    fallback: T,
): T {
    return value && values.includes(value as T) ? (value as T) : fallback;
}
function page(value?: string): number {
    const parsed = Number(value ?? '1');
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 10_000
        ? parsed
        : 1;
}
function id(value: string): string {
    const parsed = value.trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(parsed))
        throw new ValidationError('ID invoice tidak valid.');
    return parsed;
}
async function context() {
    await requireFinanceAccess();
    await requireMobilePortalAccess('finance');
    const db = getTenantDbFromContext();
    if (!db)
        throw new BusinessRuleError(
            'Konteks workspace finance tidak tersedia.',
        );
    const permissions = await getMyExplicitFeaturePermissions();
    return {
        db,
        canViewAmounts:
            permissions.success &&
            permissions.data.includes('feature:view-prices'),
    };
}

export const getFinanceMobileOverview = withTenant(
    async function getFinanceMobileOverview(input?: {
        type?: string;
        due?: string;
        bucket?: string;
        page?: string;
    }) {
        return safeAction(async () => {
            const ctx = await context();
            return readFinanceMobileOverview(ctx.db, {
                type: includes(
                    FINANCE_MOBILE_TYPES,
                    input?.type,
                    'ALL',
                ) as FinanceMobileType,
                due: includes(
                    FINANCE_MOBILE_DUE_FILTERS,
                    input?.due,
                    'ALL',
                ) as FinanceMobileDueFilter,
                bucket: includes(
                    FINANCE_MOBILE_BUCKETS,
                    input?.bucket,
                    'ALL',
                ) as FinanceMobileBucket,
                page: page(input?.page),
                canViewAmounts: ctx.canViewAmounts,
            });
        });
    },
);

export const getFinanceMobileInvoiceDetail = withTenant(
    async function getFinanceMobileInvoiceDetail(
        type: string,
        invoiceId: string,
    ) {
        return safeAction(async () => {
            const parsedType = includes(['AR', 'AP'] as const, type, 'AR');
            if (parsedType !== type)
                throw new ValidationError('Jenis invoice tidak valid.');
            const ctx = await context();
            return readFinanceMobileInvoiceDetail(
                ctx.db,
                parsedType,
                id(invoiceId),
                ctx.canViewAmounts,
            );
        });
    },
);
