import type { HppPriceSimulatorAccessDb } from '@/lib/auth/hpp-price-simulator-access';
import { ValidationError } from '@/lib/errors/errors';
import {
    hppSimulatorDefaultNumber,
    resolveHppSimulatorUnitCost,
    type HppSimulatorCostCandidates,
    type HppSimulatorCostWarning,
    type HppSimulatorNumberInput,
} from '@/lib/production/hpp-price-simulator';
import type { LocationType, Unit } from '@prisma/client';

export interface HppPriceSimulatorVariantOptionDTO {
    id: string;
    name: string;
    skuCode: string;
    primaryOutputUnit: Unit;
    defaultBom: {
        id: string;
        name: string;
        outputQuantity: number;
    };
}

export interface HppPriceSimulatorMaterialDTO {
    id: string;
    productVariantId: string;
    name: string;
    skuCode: string;
    primaryUnit: Unit;
    quantity: HppSimulatorNumberInput;
    scrapPercentage: HppSimulatorNumberInput;
    unitCost: HppSimulatorNumberInput;
    costSource:
        | 'inventory_average'
        | 'standard_cost'
        | 'buy_price'
        | 'missing';
    costCandidates: HppSimulatorCostCandidates;
    costWarnings: HppSimulatorCostWarning[];
}

export interface HppPriceSimulatorDefaultDTO {
    variant: {
        id: string;
        name: string;
        skuCode: string;
        primaryOutputUnit: Unit;
    };
    bom: {
        id: string;
        name: string;
        outputQuantity: HppSimulatorNumberInput;
    };
    materials: HppPriceSimulatorMaterialDTO[];
}

type BomDetailRow = {
    id: string;
    name: string;
    outputQuantity: unknown;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: Unit;
    };
    items: Array<{
        id: string;
        productVariantId: string;
        quantity: unknown;
        scrapPercentage: unknown;
        productVariant: {
            name: string;
            skuCode: string;
            primaryUnit: Unit;
            standardCost: unknown;
            buyPrice: unknown;
            inventories: Array<{
                quantity: unknown;
                averageCost: unknown;
                location: { locationType: LocationType };
            }>;
        };
    }>;
};

export async function readHppPriceSimulatorVariantOptions(
    db: HppPriceSimulatorAccessDb,
): Promise<HppPriceSimulatorVariantOptionDTO[]> {
    const rows = await db.productVariant.findMany({
        where: {
            archivedAt: null,
            productionBoms: {
                some: {
                    isActive: true,
                    isDefault: true,
                    archivedAt: null,
                },
            },
        },
        select: {
            id: true,
            name: true,
            skuCode: true,
            primaryUnit: true,
            productionBoms: {
                where: {
                    isActive: true,
                    isDefault: true,
                    archivedAt: null,
                },
                select: { id: true, name: true, outputQuantity: true },
                orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
                take: 1,
            },
        },
        orderBy: [{ name: 'asc' }, { skuCode: 'asc' }],
    });

    return rows.flatMap((row) => {
        const defaultBom = row.productionBoms[0];
        if (!defaultBom) return [];
        return [
            {
                id: row.id,
                name: row.name,
                skuCode: row.skuCode,
                primaryOutputUnit: row.primaryUnit,
                defaultBom: {
                    id: defaultBom.id,
                    name: defaultBom.name,
                    outputQuantity: requiredPositiveNumber(
                        defaultBom.outputQuantity,
                        'BOM outputQuantity',
                    ),
                },
            },
        ];
    });
}

export async function readHppPriceSimulatorDefault(
    db: HppPriceSimulatorAccessDb,
    productVariantId: string,
): Promise<HppPriceSimulatorDefaultDTO | null> {
    const bom = (await db.bom.findFirst({
        where: {
            productVariantId,
            isActive: true,
            isDefault: true,
            archivedAt: null,
            productVariant: { archivedAt: null },
        },
        select: {
            id: true,
            name: true,
            outputQuantity: true,
            productVariant: {
                select: {
                    id: true,
                    name: true,
                    skuCode: true,
                    primaryUnit: true,
                },
            },
            items: {
                select: {
                    id: true,
                    productVariantId: true,
                    quantity: true,
                    scrapPercentage: true,
                    productVariant: {
                        select: {
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                            standardCost: true,
                            buyPrice: true,
                            inventories: {
                                select: {
                                    quantity: true,
                                    averageCost: true,
                                    location: {
                                        select: { locationType: true },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: { id: 'asc' },
            },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    })) as BomDetailRow | null;

    if (!bom) return null;

    return {
        variant: {
            id: bom.productVariant.id,
            name: bom.productVariant.name,
            skuCode: bom.productVariant.skuCode,
            primaryOutputUnit: bom.productVariant.primaryUnit,
        },
        bom: {
            id: bom.id,
            name: bom.name,
            outputQuantity: hppSimulatorDefaultNumber(
                requiredPositiveNumber(
                    bom.outputQuantity,
                    'BOM outputQuantity',
                ),
                { source: 'bom' },
            ),
        },
        materials: bom.items.map((item) => {
            const costSnapshot = resolveHppSimulatorUnitCost({
                inventories: item.productVariant.inventories.map(
                    (inventory) => ({
                        locationType: inventory.location.locationType,
                        quantity: numericValue(inventory.quantity),
                        averageCost: nullableNumericValue(
                            inventory.averageCost,
                        ),
                    }),
                ),
                standardCost: nullableNumericValue(
                    item.productVariant.standardCost,
                ),
                buyPrice: nullableNumericValue(item.productVariant.buyPrice),
            });
            const candidates = costSnapshot.metadata.candidates;
            if (!candidates) {
                throw new ValidationError(
                    'Metadata kandidat biaya simulator tidak tersedia.',
                );
            }

            return {
                id: item.id,
                productVariantId: item.productVariantId,
                name: item.productVariant.name,
                skuCode: item.productVariant.skuCode,
                primaryUnit: item.productVariant.primaryUnit,
                quantity: hppSimulatorDefaultNumber(
                    nonNegativeNumber(item.quantity, 'BOM item quantity'),
                    { source: 'bom' },
                ),
                scrapPercentage: hppSimulatorDefaultNumber(
                    nonNegativeNumber(
                        item.scrapPercentage ?? 0,
                        'BOM item scrapPercentage',
                    ),
                    { source: 'bom' },
                ),
                unitCost: hppSimulatorDefaultNumber(
                    costSnapshot.value,
                    costSnapshot.metadata,
                ),
                costSource: costSnapshot.metadata.source as HppPriceSimulatorMaterialDTO['costSource'],
                costCandidates: candidates,
                costWarnings: costSnapshot.metadata.warnings ?? [],
            };
        }),
    };
}

function numericValue(value: unknown): number {
    if (
        typeof value === 'object' &&
        value !== null &&
        'toNumber' in value &&
        typeof value.toNumber === 'function'
    ) {
        return value.toNumber();
    }
    return Number(value);
}

function nullableNumericValue(value: unknown): number | null {
    return value === null || value === undefined ? null : numericValue(value);
}

function requiredPositiveNumber(value: unknown, label: string): number {
    const number = numericValue(value);
    if (!Number.isFinite(number) || number <= 0) {
        throw new ValidationError(`${label} harus lebih besar dari nol.`);
    }
    return number;
}

function nonNegativeNumber(value: unknown, label: string): number {
    const number = numericValue(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new ValidationError(`${label} harus berupa angka non-negatif.`);
    }
    return number;
}
