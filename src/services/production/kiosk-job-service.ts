import { ProductionStatus } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';

/** One SPK card on the public kiosk list: no prices or costs, plain numbers only. */
export interface KioskJobCard {
    id: string;
    orderNumber: string;
    status: string;
    isRunning: boolean;
    productName: string;
    unit: {
        primaryUnit: string | null;
        salesUnit: string | null;
        conversionFactor: number | null;
    };
    plannedQuantity: number;
    plannedEnteredQuantity: number | null;
    plannedEnteredUnit: string | null;
    plannedConversionFactorSnapshot: number | null;
    actualQuantity: number;
    executionMode: string | null;
    machine: { id: string; name: string } | null;
    /** Set when the SPK records actual etiket and packaging per output. */
    packaging: { labelName: string | null; labelStock: number | null } | null;
}

const toNumber = (value: { toString(): string } | null | undefined) =>
    value === null || value === undefined ? null : Number(value);

// Stock the kiosk may draw labels from: own warehouses and customer custody.
const KIOSK_STOCK_LOCATION = {
    OR: [
        { location: { locationType: 'INTERNAL' as const } },
        { location: { packagingOwnerCustomerId: { not: null } } },
    ],
};

async function loadLabelsByBrand(brandIds: string[]) {
    if (brandIds.length === 0)
        return new Map<string, { name: string; stock: number }>();
    const options = await prisma.productionPackagingOption.findMany({
        where: {
            outputVariantId: { in: brandIds },
            labelVariantId: { not: null },
        },
        select: {
            outputVariantId: true,
            labelVariantId: true,
            labelVariant: { select: { name: true } },
        },
    });
    const labelIds = [
        ...new Set(options.map((option) => option.labelVariantId as string)),
    ];
    const stock = labelIds.length
        ? await prisma.inventory.groupBy({
              by: ['productVariantId'],
              where: {
                  productVariantId: { in: labelIds },
                  ...KIOSK_STOCK_LOCATION,
              },
              _sum: { quantity: true },
          })
        : [];
    return new Map(
        options.map((option) => [
            option.outputVariantId,
            {
                name: option.labelVariant?.name ?? '',
                stock: Number(
                    stock.find(
                        (row) => row.productVariantId === option.labelVariantId,
                    )?._sum.quantity ?? 0,
                ),
            },
        ]),
    );
}

/** SPKs ready or running, newest work first, shaped for the kiosk list. */
export async function listKioskJobs(): Promise<KioskJobCard[]> {
    const orders = await prisma.productionOrder.findMany({
        where: {
            status: {
                in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS],
            },
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            plannedQuantity: true,
            plannedEnteredQuantity: true,
            plannedEnteredUnit: true,
            plannedConversionFactorSnapshot: true,
            actualQuantity: true,
            executionModeSnapshot: true,
            actualPackagingEnabled: true,
            requestedOutputVariantId: true,
            bom: {
                select: {
                    productVariant: {
                        select: {
                            name: true,
                            primaryUnit: true,
                            salesUnit: true,
                            conversionFactor: true,
                        },
                    },
                },
            },
            machine: { select: { id: true, name: true } },
            executions: {
                where: { endTime: null },
                select: { id: true },
                take: 1,
            },
        },
        orderBy: [{ status: 'desc' }, { plannedStartDate: 'asc' }],
    });

    const labels = await loadLabelsByBrand([
        ...new Set(
            orders
                .filter((order) => order.actualPackagingEnabled)
                .map((order) => order.requestedOutputVariantId)
                .filter((id): id is string => !!id),
        ),
    ]);

    return orders.map((order) => {
        const variant = order.bom.productVariant;
        const label = order.requestedOutputVariantId
            ? labels.get(order.requestedOutputVariantId)
            : undefined;
        return {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            isRunning: order.executions.length > 0,
            productName: variant.name,
            unit: {
                primaryUnit: variant.primaryUnit,
                salesUnit: variant.salesUnit,
                conversionFactor: toNumber(variant.conversionFactor),
            },
            plannedQuantity: Number(order.plannedQuantity),
            plannedEnteredQuantity: toNumber(order.plannedEnteredQuantity),
            plannedEnteredUnit: order.plannedEnteredUnit,
            plannedConversionFactorSnapshot: toNumber(
                order.plannedConversionFactorSnapshot,
            ),
            actualQuantity: Number(order.actualQuantity ?? 0),
            executionMode: order.executionModeSnapshot,
            machine: order.machine,
            packaging: order.actualPackagingEnabled
                ? {
                      labelName: label?.name ?? null,
                      labelStock: label?.stock ?? null,
                  }
                : null,
        };
    });
}
