'use server';

import {
    requireSalesAccess,
    requireSalesApprover,
} from '@/lib/auth/sales-access';
import { withTenant } from '@/lib/core/tenant';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { getReturnShipmentSources, type ReturnSourceSelection } from '@/services/sales/return-receiving-service';
import { revalidatePath } from 'next/cache';
import { SalesReturnService } from '@/services/sales/returns-service';
import {
    createSalesReturnSchema,
    } from '@/lib/schemas/returns';
import * as z from 'zod';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

function revalidateReturnViews(id: string) {
    revalidatePath('/sales/returns');
    revalidatePath(`/sales/returns/${id}`);
    revalidatePath('/finance');
    revalidatePath('/finance/returns');
    revalidatePath(`/finance/returns/${id}`);
}

export const getSalesReturns = withTenant(async function getSalesReturns(
    filters?: Record<string, unknown>,
) {
    return safeAction(async () => {
        await requireSalesAccess();
        const returns = await SalesReturnService.getReturns(filters);
        return returns; // Assumes serializeData is done at component level or not needed if no Dates are strictly passed to client
    });
});

export const getSalesReturnById = withTenant(async function getSalesReturnById(
    id: string,
) {
    return safeAction(async () => {
        await requireSalesAccess();
        const salesReturn = await SalesReturnService.getReturnById(id);
        return salesReturn;
    });
});

export const createSalesReturnAction = withTenant(
    async function createSalesReturnAction(
        data: z.infer<typeof createSalesReturnSchema>,
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const parsedData = createSalesReturnSchema.parse(data);
            const salesReturn = await SalesReturnService.createReturn(
                parsedData,
                session.user.id,
            );

            revalidateReturnViews(salesReturn.id);
            return salesReturn;
        });
    },
);
export const confirmSalesReturnAction = withTenant(
    async function confirmSalesReturnAction(id: string) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const salesReturn = await SalesReturnService.confirmReturn(
                id,
                session.user.id,
            );

            revalidateReturnViews(id);
            return salesReturn;
        });
    },
);

export const receiveSalesReturnAction = withTenant(
    async function receiveSalesReturnAction(id: string, selections?: ReturnSourceSelection) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const salesReturn = await SalesReturnService.receiveReturn(
                id,
                session.user.id,
                selections,
            );

            revalidateReturnViews(id);
            revalidatePath('/warehouse/inventory');
            revalidatePath('/finance/journals');
            return salesReturn;
        });
    },
);

export const getSalesReturnShipmentSources = withTenant(async function getSalesReturnShipmentSources(id: string) {
    return safeAction(async () => {
        await requireSalesAccess();
        const db = getTenantDbFromContext();
        if (!db) throw new BusinessRuleError('Konteks tenant wajib untuk retur.');
        return getReturnShipmentSources(db, z.string().min(1).max(100).parse(id));
    });
});

export const completeSalesReturnAction = withTenant(
    async function completeSalesReturnAction(id: string) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const salesReturn = await SalesReturnService.completeReturn(
                id,
                session.user.id,
            );

            revalidateReturnViews(id);
            return salesReturn;
        });
    },
);

export const cancelSalesReturnAction = withTenant(
    async function cancelSalesReturnAction(id: string) {
        return safeAction(async () => {
            const session = await requireSalesApprover();
            const salesReturn = await SalesReturnService.cancelReturn(
                id,
                session.user.id,
            );

            revalidateReturnViews(id);
            return salesReturn;
        });
    },
);
