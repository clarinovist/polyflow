'use server';

import { canViewPrices } from '@/actions/admin/permissions';
import { requirePurchasingAccess } from '@/lib/auth/purchasing-access';
import { getUserRoles } from '@/lib/auth/roles';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, ValidationError } from '@/lib/errors/errors';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import { serializeData } from '@/lib/utils/utils';
import {
    PURCHASING_MOBILE_FILTERS,
    readPurchasingMobileDetail,
    readPurchasingMobileOverview,
    type PurchasingMobileDetailKind,
    type PurchasingMobileTaskFilter,
} from '@/services/purchasing/mobile-purchasing-service';

function parseFilter(value?: string): PurchasingMobileTaskFilter {
    return PURCHASING_MOBILE_FILTERS.includes(
        value as PurchasingMobileTaskFilter,
    )
        ? (value as PurchasingMobileTaskFilter)
        : 'ALL';
}

function parseId(value: string): string {
    const id = value.trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
        throw new ValidationError('ID detail purchasing tidak valid.');
    }
    return id;
}

async function readContext() {
    const session = await requirePurchasingAccess();
    await requireMobilePortalAccess('purchasing');
    const roles = getUserRoles(session.user);
    const canReadTeamRequests =
        roles.includes('ADMIN') || roles.includes('PROCUREMENT');
    const prOwnerId = canReadTeamRequests ? undefined : session.user.id;
    // Use canonical price visibility (active ADMIN or an explicit grant).
    // Failed permission reads still withhold every amount-bearing query/field.
    const pricePermission = await canViewPrices();
    return {
        prOwnerId,
        canViewAmounts: pricePermission.success && pricePermission.data === true,
    };
}

export const getPurchasingMobileOverview = withTenant(
    async function getPurchasingMobileOverview(filter?: string) {
        return safeAction(async () => {
            const context = await readContext();
            const data = await readPurchasingMobileOverview({
                ...context,
                filter: parseFilter(filter),
            });
            return serializeData(data);
        });
    },
);

async function getDetail(kind: PurchasingMobileDetailKind, id: string) {
    return safeAction(async () => {
        const parsedId = parseId(id);
        const context = await readContext();
        const data = await readPurchasingMobileDetail({
            ...context,
            kind,
            id: parsedId,
        });
        return serializeData(data);
    });
}

export const getPurchasingMobileRequestDetail = withTenant(
    async function getPurchasingMobileRequestDetail(id: string) {
        return getDetail('REQUEST', id);
    },
);

export const getPurchasingMobileOrderDetail = withTenant(
    async function getPurchasingMobileOrderDetail(id: string) {
        return getDetail('ORDER', id);
    },
);

export const getPurchasingMobileReceiptDetail = withTenant(
    async function getPurchasingMobileReceiptDetail(id: string) {
        return getDetail('RECEIPT', id);
    },
);
