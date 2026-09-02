'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { ProductionStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';
import {
    MACHINE_STAGE_MAP_SETTING_KEY,
    parseMachineStageMap,
} from '@/lib/production/machine-compatibility';

/**
 * Data source for the /production/daily board (SPK Aktif).
 *
 * Purpose-built single round-trip replacing the previous 4-action fan-out
 * (getProductionOrders + getBoms + getMachines + getMachineStageMap) that
 * fetched ALL 490 orders (incl. COMPLETED/CANCELLED), all 120 BOMs with
 * items/inventories, and nested machine executions — for a board that
 * renders only active orders (~13) and a light produce dialog.
 *
 * NOTE: `executions` IS included here (id + quantities + status only).
 * The board shows "N batch / Scrap N" per order (DailyProductionDashboard
 * OrderCard) — the previous shared action never selected executions, so
 * that info silently rendered empty. This fixes it. Same heuristic as
 * executionScrapTotal(): consumers must still use max() not sum().
 */
export const getDailyBoardData = withTenant(
    async function getDailyBoardData() {
        return safeAction(async () => {
            await requireAuth();

            const activeStatuses: ProductionStatus[] = [
                ProductionStatus.RELEASED,
                ProductionStatus.IN_PROGRESS,
                ProductionStatus.WAITING_MATERIAL,
            ];

            const [orders, boms, machines, stageMapRow] = await Promise.all([
                prisma.productionOrder.findMany({
                    where: { status: { in: activeStatuses } },
                    select: {
                        id: true,
                        orderNumber: true,
                        status: true,
                        plannedQuantity: true,
                        plannedEnteredQuantity: true,
                        plannedEnteredUnit: true,
                        plannedConversionFactorSnapshot: true,
                        actualQuantity: true,
                        plannedStartDate: true,
                        notes: true,
                        isMaklon: true,
                        priority: true,
                        machineId: true,
                        bom: {
                            select: {
                                id: true,
                                name: true,
                                category: true,
                                productVariant: {
                                    select: {
                                        id: true,
                                        name: true,
                                        primaryUnit: true,
                                        salesUnit: true,
                                        conversionFactor: true,
                                        product: {
                                            select: { id: true, name: true },
                                        },
                                    },
                                },
                            },
                        },
                        machine: {
                            select: { id: true, name: true, code: true },
                        },
                        plannedMaterials: {
                            select: {
                                id: true,
                                productVariantId: true,
                                quantity: true,
                            },
                        },
                        executions: {
                            where: { status: { not: 'VOIDED' } },
                            select: {
                                id: true,
                                quantityProduced: true,
                                scrapQuantity: true,
                                scrapProngkolQty: true,
                                scrapDaunQty: true,
                                startTime: true,
                                endTime: true,
                                status: true,
                            },
                            orderBy: { startTime: 'desc' },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.bom.findMany({
                    where: { isActive: true, isDefault: true },
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        productVariant: {
                            select: {
                                id: true,
                                name: true,
                                product: {
                                    select: { id: true, name: true },
                                },
                            },
                        },
                    },
                    orderBy: { updatedAt: 'desc' },
                }),
                prisma.machine.findMany({
                    where: { status: 'ACTIVE' },
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        type: true,
                        status: true,
                    },
                    orderBy: { code: 'asc' },
                }),
                prisma.appSetting.findUnique({
                    where: { key: MACHINE_STAGE_MAP_SETTING_KEY },
                    select: { value: true },
                }),
            ]);

            return {
                orders: orders.map((order) => ({
                    ...order,
                    plannedQuantity: order.plannedQuantity.toNumber(),
                    plannedEnteredQuantity:
                        order.plannedEnteredQuantity?.toNumber() ?? null,
                    plannedConversionFactorSnapshot:
                        order.plannedConversionFactorSnapshot?.toNumber() ??
                        null,
                    actualQuantity: order.actualQuantity?.toNumber() ?? null,
                    plannedMaterials: order.plannedMaterials.map((pm) => ({
                        ...pm,
                        quantity: pm.quantity.toNumber(),
                    })),
                    executions: order.executions.map((ex) => ({
                        ...ex,
                        quantityProduced: ex.quantityProduced.toNumber(),
                        scrapQuantity: ex.scrapQuantity.toNumber(),
                        scrapProngkolQty: ex.scrapProngkolQty.toNumber(),
                        scrapDaunQty: ex.scrapDaunQty.toNumber(),
                    })),
                })),
                boms,
                machines,
                machineStageMap: parseMachineStageMap(stageMapRow?.value),
            };
        });
    },
);
