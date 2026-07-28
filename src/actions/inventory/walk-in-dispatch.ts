'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireWarehouseResourcePermission } from '@/lib/tools/auth-checks';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import {
    createWalkInDispatch,
    approveWalkInDispatch,
    rejectWalkInDispatch,
    type WalkInDispatchInput,
} from '@/services/sales/walk-in-dispatch-service';

export const createEmergencyDispatch = withTenant(
    async function createEmergencyDispatch(data: WalkInDispatchInput) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing/walk-in',
            );

            const result = await createWalkInDispatch(data, session.user.id);

            await logActivity({
                userId: session.user.id,
                action: 'CREATE_EMERGENCY_SALES_ORDER',
                entityType: 'SalesOrder',
                entityId: result.salesOrder.id,
                details: `Emergency SO ${result.salesOrder.orderNumber} (ref: ${data.sourceReference})${result.needsApproval ? ' — needs approval' : ''}`,
            });

            revalidatePath('/warehouse/mobile/outgoing');
            revalidatePath('/sales/orders');
            revalidatePath('/warehouse/outgoing');

            return serializeData(result);
        });
    },
);

export const approveEmergencyDispatch = withTenant(
    async function approveEmergencyDispatch(salesOrderId: string) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing/walk-in-approve',
            );

            const result = await approveWalkInDispatch(
                salesOrderId,
                session.user.id,
            );

            await logActivity({
                userId: session.user.id,
                action: 'APPROVE_EMERGENCY_COMMERCIAL',
                entityType: 'SalesOrder',
                entityId: salesOrderId,
                details: `Emergency dispatch approved, DO ${result.deliveryOrder?.orderNumber ?? 'pending'} created`,
            });

            revalidatePath('/warehouse/mobile/outgoing');
            revalidatePath('/sales/orders');
            revalidatePath(`/sales/orders/${salesOrderId}`);
            revalidatePath('/warehouse/outgoing');

            return serializeData(result);
        });
    },
);

export const rejectEmergencyDispatch = withTenant(
    async function rejectEmergencyDispatch(
        salesOrderId: string,
        reason?: string,
    ) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing/walk-in-approve',
            );

            const result = await rejectWalkInDispatch(
                salesOrderId,
                session.user.id,
                reason,
            );

            await logActivity({
                userId: session.user.id,
                action: 'REJECT_EMERGENCY_COMMERCIAL',
                entityType: 'SalesOrder',
                entityId: salesOrderId,
                details: `Emergency dispatch rejected${reason ? `: ${reason}` : ''}`,
            });

            revalidatePath('/warehouse/mobile/outgoing');
            revalidatePath('/sales/orders');
            revalidatePath('/warehouse/outgoing');

            return serializeData(result);
        });
    },
);
