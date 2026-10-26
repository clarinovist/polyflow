import { ProductionStatus } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { ISSUABLE_MATERIAL_TYPES } from '@/lib/constants/products';
import { executionScrapTotal } from '@/lib/production/execution-scrap';

/** One recorded output on Fokus SPK, with what it used. */
export interface KioskOutputLog {
    id: string;
    recordedAt: Date;
    operatorName: string | null;
    /** Base unit, as stored. */
    quantity: number;
    enteredQuantity: number | null;
    enteredUnit: string | null;
    scrapKg: number;
    packaging: Array<{ name: string; quantity: number; unit: string }>;
}

const OUTPUT_LOG_LIMIT = 10;
// ProductionExecution.status is a plain string column.
const VOIDED = 'VOIDED';
const KIOSK_ORDER_STATUSES: string[] = [
    ProductionStatus.RELEASED,
    ProductionStatus.IN_PROGRESS,
];

// Explicit fields only: this page is public and every prop reaches the browser.
const focusOrderSelect = {
    id: true,
    orderNumber: true,
    status: true,
    plannedQuantity: true,
    plannedEnteredQuantity: true,
    plannedEnteredUnit: true,
    plannedConversionFactorSnapshot: true,
    actualQuantity: true,
    actualPackagingEnabled: true,
    executionModeSnapshot: true,
    processCodeSnapshot: true,
    processNameSnapshot: true,
    bom: {
        select: {
            outputQuantity: true,
            productVariantId: true,
            productVariant: {
                select: {
                    name: true,
                    skuCode: true,
                    primaryUnit: true,
                    salesUnit: true,
                    conversionFactor: true,
                },
            },
            items: {
                select: {
                    id: true,
                    quantity: true,
                    productVariant: {
                        select: {
                            id: true,
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                        },
                    },
                },
            },
        },
    },
    machine: { select: { id: true, name: true } },
    executions: {
        orderBy: { startTime: 'desc' as const },
        select: {
            id: true,
            startTime: true,
            endTime: true,
            createdAt: true,
            status: true,
            quantityProduced: true,
            enteredQuantity: true,
            enteredUnit: true,
            scrapQuantity: true,
            scrapProngkolQty: true,
            scrapDaunQty: true,
            operatorId: true,
            shiftId: true,
            operator: { select: { name: true } },
            shift: { select: { shiftName: true } },
        },
    },
    helpers: { select: { id: true, name: true } },
};

type FocusExecution = {
    id: string;
    endTime: Date | null;
    createdAt: Date;
    status: string;
    quantityProduced: unknown;
    enteredQuantity: unknown;
    enteredUnit: string | null;
    scrapQuantity: unknown;
    scrapProngkolQty: unknown;
    scrapDaunQty: unknown;
    operator: { name: string } | null;
};

type PackagingRow = {
    executionId: string;
    quantity: unknown;
    unit: string;
    productVariant: { name: string };
};

function toOutputLogs(
    executions: FocusExecution[],
    packaging: PackagingRow[],
): KioskOutputLog[] {
    return executions
        .filter(
            (execution) =>
                execution.status !== VOIDED &&
                execution.endTime !== null &&
                (Number(execution.quantityProduced) > 0 ||
                    executionScrapTotal(execution) > 0),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, OUTPUT_LOG_LIMIT)
        .map((execution) => ({
            id: execution.id,
            recordedAt: execution.createdAt,
            operatorName: execution.operator?.name ?? null,
            quantity: Number(execution.quantityProduced),
            enteredQuantity:
                execution.enteredQuantity == null
                    ? null
                    : Number(execution.enteredQuantity),
            enteredUnit: execution.enteredUnit,
            scrapKg: executionScrapTotal(execution),
            packaging: packaging
                .filter((row) => row.executionId === execution.id)
                .map((row) => ({
                    name: row.productVariant.name,
                    quantity: Number(row.quantity),
                    unit: row.unit,
                })),
        }));
}

/** Everything Fokus SPK shows, or null when the kiosk cannot work on the SPK. */
export async function loadKioskFocus(orderId: string) {
    const order = await prisma.productionOrder.findUnique({
        where: { id: orderId },
        select: focusOrderSelect,
    });
    if (!order || !KIOSK_ORDER_STATUSES.includes(order.status)) return null;

    const [shifts, materials, packaging] = await Promise.all([
        prisma.productionShift.findMany({
            where: { productionOrderId: orderId },
            select: {
                id: true,
                shiftName: true,
                startTime: true,
                endTime: true,
                operatorId: true,
            },
            orderBy: { startTime: 'asc' },
        }),
        prisma.productVariant.findMany({
            where: {
                archivedAt: null,
                product: {
                    productType: { in: [...ISSUABLE_MATERIAL_TYPES] },
                },
            },
            select: {
                id: true,
                name: true,
                skuCode: true,
                primaryUnit: true,
                product: { select: { productType: true } },
            },
            orderBy: { name: 'asc' },
        }),
        prisma.productionPackagingConsumption.findMany({
            where: {
                execution: {
                    productionOrderId: orderId,
                    status: { not: VOIDED },
                },
            },
            select: {
                executionId: true,
                quantity: true,
                unit: true,
                productVariant: { select: { name: true } },
            },
        }),
    ]);

    return {
        order,
        shifts,
        materials,
        outputLogs: toOutputLogs(order.executions, packaging),
    };
}
