import { Prisma } from '@prisma/client';
import { isEligibleMaterialSourceLocation } from '@/lib/locations/resolve-location';

const BRIEFING_LIMIT = 20;

export type ProductionReadClient = Prisma.TransactionClient;

type DecimalLike = Prisma.Decimal | number | string;

export type ProductionOrderCandidate = {
    id: string;
    orderNumber: string;
    status: string;
    product: string;
};

export type ProductionMaterialCheck = {
    productVariantId: string;
    material: string;
    required: number;
    issued: number;
    remaining: number;
    available: number;
    sourceLocation: string | null;
    shortage: number;
};

export type ProductionOrderDiagnosis = {
    kind: 'missing' | 'ambiguous' | 'selected';
    candidates: ProductionOrderCandidate[];
    order?: ProductionOrderCandidate & {
        plannedQuantity: number;
        actualQuantity: number;
        plannedStartDate: Date;
        plannedEndDate: Date | null;
        machine: string | null;
        materialConsumptionMode: string;
        openIssues: Array<{ category: string; description: string }>;
        materials: ProductionMaterialCheck[];
        materialCheck: 'complete' | 'partial';
        materialCheckReason?: string;
    };
};

export type ProductionBriefingItem = ProductionOrderCandidate & {
    plannedQuantity: number;
    actualQuantity: number;
    plannedEndDate: Date | null;
    machine: string | null;
    priority: string;
    openIssueCount: number;
};

export type ProductionBriefing = {
    items: ProductionBriefingItem[];
    total: number;
    truncated: boolean;
};

function numberOf(value: DecimalLike | null | undefined): number {
    return Number(value ?? 0);
}

async function findOrderCandidates(
    tx: ProductionReadClient,
    searchTerm: string,
): Promise<ProductionOrderCandidate[]> {
    const exact = await tx.productionOrder.findUnique({
        where: { id: searchTerm },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            bom: {
                select: {
                    productVariant: {
                        select: { product: { select: { name: true } } },
                    },
                },
            },
        },
    });
    if (exact) {
        return [
            {
                id: exact.id,
                orderNumber: exact.orderNumber,
                status: exact.status,
                product: exact.bom.productVariant.product.name,
            },
        ];
    }

    const exactNumber = await tx.productionOrder.findUnique({
        where: { orderNumber: searchTerm },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            bom: {
                select: {
                    productVariant: {
                        select: { product: { select: { name: true } } },
                    },
                },
            },
        },
    });
    if (exactNumber) {
        return [
            {
                id: exactNumber.id,
                orderNumber: exactNumber.orderNumber,
                status: exactNumber.status,
                product: exactNumber.bom.productVariant.product.name,
            },
        ];
    }

    const rows = await tx.productionOrder.findMany({
        where: {
            orderNumber: { contains: searchTerm, mode: 'insensitive' },
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            bom: {
                select: {
                    productVariant: {
                        select: { product: { select: { name: true } } },
                    },
                },
            },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 6,
    });

    return rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        product: row.bom.productVariant.product.name,
    }));
}

export async function diagnoseProductionOrder(
    tx: ProductionReadClient,
    searchTerm: string,
): Promise<ProductionOrderDiagnosis> {
    const candidates = await findOrderCandidates(tx, searchTerm.trim());
    if (candidates.length === 0) return { kind: 'missing', candidates };
    if (candidates.length > 1) return { kind: 'ambiguous', candidates };

    const selected = candidates[0];
    const order = await tx.productionOrder.findUnique({
        where: { id: selected.id },
        select: {
            plannedQuantity: true,
            actualQuantity: true,
            plannedStartDate: true,
            plannedEndDate: true,
            materialConsumptionMode: true,
            machine: { select: { name: true } },
            issues: {
                where: { status: 'OPEN' },
                select: { category: true, description: true },
                orderBy: { reportedAt: 'asc' },
            },
            plannedMaterials: {
                select: {
                    productVariantId: true,
                    quantity: true,
                    sourceLocationId: true,
                    sourceLocation: { select: { name: true } },
                    productVariant: {
                        select: {
                            name: true,
                            product: { select: { name: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'asc' },
            },
            materialIssues: {
                where: { status: { not: 'VOIDED' } },
                select: {
                    productVariantId: true,
                    quantity: true,
                    status: true,
                },
            },
        },
    });
    if (!order) return { kind: 'missing', candidates: [] };

    const locations = await tx.location.findMany({
        select: { id: true, name: true, slug: true, locationPurpose: true },
    });
    const eligibleLocationIds = locations
        .filter(isEligibleMaterialSourceLocation)
        .map((location) => location.id);

    const variantIds = order.plannedMaterials.map(
        (material) => material.productVariantId,
    );
    const inventoryRows = variantIds.length
        ? await tx.inventory.findMany({
              where: {
                  productVariantId: { in: variantIds },
                  locationId: { in: eligibleLocationIds },
                  quantity: { gt: 0 },
              },
              select: {
                  productVariantId: true,
                  locationId: true,
                  quantity: true,
              },
          })
        : [];
    const reservationRows = variantIds.length
        ? await tx.stockReservation.findMany({
              where: {
                  productVariantId: { in: variantIds },
                  locationId: { in: eligibleLocationIds },
                  status: 'ACTIVE',
                  NOT: {
                      reservedFor: 'PRODUCTION_ORDER',
                      referenceId: selected.id,
                  },
              },
              select: {
                  productVariantId: true,
                  locationId: true,
                  quantity: true,
              },
          })
        : [];

    const issuedByVariant = new Map<string, number>();
    const stagedByVariant = new Map<string, number>();
    for (const issue of order.materialIssues) {
        issuedByVariant.set(
            issue.productVariantId,
            (issuedByVariant.get(issue.productVariantId) ?? 0) +
                numberOf(issue.quantity),
        );
        if (issue.status === 'STAGED') {
            stagedByVariant.set(
                issue.productVariantId,
                (stagedByVariant.get(issue.productVariantId) ?? 0) +
                    numberOf(issue.quantity),
            );
        }
    }

    const materials = order.plannedMaterials.map((material) => {
        const required = numberOf(material.quantity);
        const issued = issuedByVariant.get(material.productVariantId) ?? 0;
        const remaining = Math.max(0, required - issued);
        const appliesToMaterial = (row: {
            productVariantId: string;
            locationId: string;
        }) =>
            row.productVariantId === material.productVariantId &&
            (!material.sourceLocationId ||
                row.locationId === material.sourceLocationId);
        const physical = inventoryRows
            .filter(appliesToMaterial)
            .reduce((total, row) => total + numberOf(row.quantity), 0);
        const reservedElsewhere = reservationRows
            .filter(appliesToMaterial)
            .reduce((total, row) => total + numberOf(row.quantity), 0);
        // STAGED issues are already counted toward the fulfilled plan but may
        // still exist in Inventory at a staging location. Remove them from the
        // pool for the unissued remainder to avoid counting the same stock twice.
        const staged = stagedByVariant.get(material.productVariantId) ?? 0;
        const available = Math.max(0, physical - reservedElsewhere - staged);
        return {
            productVariantId: material.productVariantId,
            material:
                material.productVariant.name ||
                material.productVariant.product.name,
            required,
            issued,
            remaining,
            available,
            sourceLocation: material.sourceLocation?.name ?? null,
            shortage: Math.max(0, remaining - available),
        };
    });

    const materialCheck =
        order.plannedMaterials.length > 0 ? 'complete' : 'partial';

    return {
        kind: 'selected',
        candidates,
        order: {
            ...selected,
            plannedQuantity: numberOf(order.plannedQuantity),
            actualQuantity: numberOf(order.actualQuantity),
            plannedStartDate: order.plannedStartDate,
            plannedEndDate: order.plannedEndDate,
            machine: order.machine?.name ?? null,
            materialConsumptionMode: order.materialConsumptionMode,
            openIssues: order.issues,
            materials,
            materialCheck,
            ...(materialCheck === 'partial'
                ? {
                      materialCheckReason:
                          'SPK tidak memiliki rencana material tersimpan; kecukupan material belum dapat dipastikan.',
                  }
                : {}),
        },
    };
}

export async function getProductionBriefing(
    tx: ProductionReadClient,
): Promise<ProductionBriefing> {
    const where: Prisma.ProductionOrderWhereInput = {
        status: {
            in: ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'WAITING_MATERIAL'],
        },
    };
    const [rows, total] = await Promise.all([
        tx.productionOrder.findMany({
            where,
            select: {
                id: true,
                orderNumber: true,
                status: true,
                priority: true,
                plannedQuantity: true,
                actualQuantity: true,
                plannedEndDate: true,
                machine: { select: { name: true } },
                bom: {
                    select: {
                        productVariant: {
                            select: { product: { select: { name: true } } },
                        },
                    },
                },
                _count: { select: { issues: { where: { status: 'OPEN' } } } },
            },
            orderBy: [
                { plannedEndDate: { sort: 'asc', nulls: 'last' } },
                { priority: 'asc' },
                { orderNumber: 'asc' },
            ],
            take: BRIEFING_LIMIT,
        }),
        tx.productionOrder.count({ where }),
    ]);

    return {
        items: rows.map((row) => ({
            id: row.id,
            orderNumber: row.orderNumber,
            status: row.status,
            product: row.bom.productVariant.product.name,
            priority: row.priority,
            plannedQuantity: numberOf(row.plannedQuantity),
            actualQuantity: numberOf(row.actualQuantity),
            plannedEndDate: row.plannedEndDate,
            machine: row.machine?.name ?? null,
            openIssueCount: row._count.issues,
        })),
        total,
        truncated: total > rows.length,
    };
}
