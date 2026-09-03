'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { ProductionStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';

export interface ActiveOrderNavItem {
    id: string;
    orderNumber: string;
    status: ProductionStatus;
    productName: string;
    plannedQuantity: number;
    actualQuantity: number;
    progressPercent: number;
}

/**
 * Minimal list of active SPK, used to move between work orders WITHOUT
 * returning to /production/daily.
 *
 * Why this exists: usage telemetry for 2026-08-04..09-03 showed the heaviest
 * user bouncing production.orders.detail <-> production.daily 939 times in 30
 * days (650 detail->daily, 682 daily->detail, avg 105s apart). The detail page
 * had no link to any other SPK — the only way out was "Kembali ke Daftar SPK",
 * so the board was being used as a navigation hub for every single hop.
 *
 * Deliberately NOT getProductionOrders(): that action's unfiltered contract is
 * shared by 7 consumers (schedule/MRP/kiosk/machines/warehouse-materials) and
 * must keep returning every status — see the comment at
 * production-orders.ts:247-249. This one filters to active statuses in SQL
 * (~13 rows instead of ~490) and selects only what the strip renders.
 *
 * Order matches getDailyBoardData (createdAt desc) so the strip and the board
 * present SPK in the same sequence; a different order would make the strip feel
 * like a different list rather than the same one.
 */
export const getActiveOrderNav = withTenant(async function getActiveOrderNav() {
    return safeAction(async () => {
        await requireAuth();

        const activeStatuses: ProductionStatus[] = [
            ProductionStatus.RELEASED,
            ProductionStatus.IN_PROGRESS,
            ProductionStatus.WAITING_MATERIAL,
        ];

        const orders = await prisma.productionOrder.findMany({
            where: { status: { in: activeStatuses } },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                plannedQuantity: true,
                actualQuantity: true,
                bom: {
                    select: {
                        productVariant: {
                            select: {
                                name: true,
                                product: { select: { name: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map((order): ActiveOrderNavItem => {
            const planned = Number(order.plannedQuantity ?? 0);
            const actual = Number(order.actualQuantity ?? 0);
            const variant = order.bom?.productVariant;

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                productName:
                    variant?.product?.name ?? variant?.name ?? order.orderNumber,
                plannedQuantity: planned,
                actualQuantity: actual,
                // Capped at 100: over-production is real (actual > planned
                // happens) but a >100% bar would break the strip layout.
                progressPercent:
                    planned > 0
                        ? Math.min(Math.round((actual / planned) * 100), 100)
                        : 0,
            };
        });
    });
});
