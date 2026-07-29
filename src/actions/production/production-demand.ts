'use server';

import { withTenant } from '@/lib/core/tenant';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    listFgDemandBoard,
    FgDemandFilters,
} from '@/services/production/fg-demand-service';
import { ProductionOrderService } from '@/services/production/order-service';
import { ProductionRoutingRunService } from '@/services/production/routing-run-service';
import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import {
    requireAuth,
    requireProductionLeaderRole,
} from '@/lib/tools/auth-checks';
import { isRoutingEnabled } from '@/lib/production/routing-feature-flag';

export const getFgDemandBoard = withTenant(async function getFgDemandBoard(
    filters?: FgDemandFilters,
) {
    return safeAction(async () => {
        await requireAuth();
        const rows = await listFgDemandBoard(filters);
        return serializeData(rows);
    });
});

export const createSpkFromDemand = withTenant(
    async function createSpkFromDemand(data: {
        productVariantId: string;
        plannedQuantity: number;
        machineId?: string;
        locationId: string;
        priority?: 'URGENT' | 'NORMAL' | 'LOW';
        notes?: string;
        routeId?: string; // I6: if route specified or active default exists, create run instead of single SPK
        idempotencyKey?: string;
    }) {
        return safeAction(async () => {
            const session = await requireProductionLeaderRole();

            const {
                productVariantId,
                plannedQuantity,
                machineId,
                locationId,
                priority,
                notes,
                routeId,
                idempotencyKey,
            } = data;

            if (!productVariantId || plannedQuantity <= 0 || !locationId) {
                throw new BusinessRuleError(
                    'Product variant, quantity > 0, and location are required.',
                );
            }

            const routingEnabled = await isRoutingEnabled();

            // I6: Prefer routing if feature flag ON and active default route exists or routeId specified
            let activeRouteId: string | null = routeId ?? null;
            if (activeRouteId && !routingEnabled) {
                activeRouteId = null; // routing flag OFF, ignore explicit routeId
            }
            if (!activeRouteId && routingEnabled) {
                const activeRoute = await prisma.productionRoute.findFirst({
                    where: { productVariantId, status: 'ACTIVE', isDefault: true },
                    select: { id: true },
                });
                activeRouteId = activeRoute?.id ?? null;
            }

            if (activeRouteId) {
                // Create production run from route
                const run = await ProductionRoutingRunService.createRun({
                    routeId: activeRouteId,
                    plannedQuantity,
                    priority: (priority as never) ?? 'NORMAL',
                    notes: notes || 'Dari Papan Permintaan FG (routed)',
                    createdById: session.user.id,
                    idempotencyKey: idempotencyKey ?? `demand-${productVariantId}-${plannedQuantity}-${locationId}`,
                });

                revalidatePath('/production/requests');
                revalidatePath('/production/runs');
                revalidatePath('/production/orders');

                return serializeData({ run, routed: true });
            }

            // Legacy fallback: single SPK from default BOM
            const bom = await prisma.bom.findFirst({
                where: {
                    productVariantId,
                    isDefault: true,
                    isActive: true,
                },
                select: { id: true },
            });

            if (!bom) {
                throw new BusinessRuleError(
                    'Tidak ada BOM default aktif untuk produk ini. Buat BOM terlebih dahulu.',
                    { productVariantId },
                    'MISSING_DEFAULT_BOM',
                );
            }

            const order = await ProductionOrderService.createOrder({
                bomId: bom.id,
                plannedQuantity,
                plannedStartDate: new Date(),
                locationId,
                machineId: machineId || undefined,
                priority: priority || 'NORMAL',
                notes: notes || 'Dari Papan Permintaan FG',
                isMaklon: false,
                estimatedConversionCost: 0,
                userId: session.user.id,
            });

            if (order.status === 'DRAFT') {
                await prisma.productionOrder.update({
                    where: { id: order.id },
                    data: { status: 'RELEASED' },
                });
            }

            revalidatePath('/production/requests');
            revalidatePath('/production/orders');

            return serializeData({ order, routed: false });
        });
    },
);
