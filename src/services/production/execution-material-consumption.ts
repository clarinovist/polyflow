import { MovementType, Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';

import { resolveMaterialLocation } from './execution-material-location';
import type {
    MaterialLike,
    OutputBackflushContext,
    ProductionExecutionOrder,
} from './execution-types';

async function resolveSourceUnitCost(
    tx: Prisma.TransactionClient,
    locationId: string,
    productVariantId: string,
    isMaklon: boolean,
) {
    const sourceInventory = await tx.inventory.findUnique({
        where: {
            locationId_productVariantId: { locationId, productVariantId },
        },
        select: {
            averageCost: true,
            productVariant: { select: { standardCost: true, buyPrice: true } },
        },
    });

    let sourceUnitCost = Number(sourceInventory?.averageCost ?? 0);
    if (sourceUnitCost === 0 && !isMaklon) {
        sourceUnitCost =
            Number(sourceInventory?.productVariant?.standardCost ?? 0) ||
            Number(sourceInventory?.productVariant?.buyPrice ?? 0);
    }

    return sourceUnitCost;
}

function hasFloorEnteredBalRule(attributes: unknown): boolean {
    return (
        !!attributes &&
        typeof attributes === 'object' &&
        !Array.isArray(attributes) &&
        (attributes as Record<string, unknown>).consumptionRule ===
            'FLOOR_ENTERED_BAL'
    );
}

const INELIGIBLE_PACKING_SCRAP_PRODUCT_TYPES = new Set([
    'PACKAGING',
    'AUXILIARY',
    'SCRAP',
    'SERVICE',
    'OPERATIONAL',
    'FIXED_ASSET',
]);

function hasPrimaryKgInputRole(attributes: unknown): boolean {
    return (
        !!attributes &&
        typeof attributes === 'object' &&
        !Array.isArray(attributes) &&
        (attributes as Record<string, unknown>).scrapBackflushRole ===
            'PRIMARY_KG_INPUT'
    );
}

function isEligiblePackingScrapMaterial(item: MaterialLike): boolean {
    const variant = item.productVariant;
    const productType = variant?.product?.productType;

    return (
        variant?.primaryUnit === 'KG' &&
        !!productType &&
        !INELIGIBLE_PACKING_SCRAP_PRODUCT_TYPES.has(productType)
    );
}

export function resolvePackingScrapMaterialId(
    items: MaterialLike[],
): string {
    const explicit = items.filter((item) =>
        hasPrimaryKgInputRole(item.productVariant?.attributes),
    );
    if (explicit.length > 0) {
        if (
            explicit.length !== 1 ||
            !isEligiblePackingScrapMaterial(explicit[0])
        ) {
            throw new BusinessRuleError(
                'Konfigurasi bahan utama affal packing tidak valid. Tandai tepat satu bahan utama KG.',
                { explicitCandidates: explicit.length },
                'PACKING_SCRAP_MATERIAL_AMBIGUOUS',
            );
        }
        return explicit[0].productVariantId;
    }

    const eligible = items.filter(isEligiblePackingScrapMaterial);
    if (eligible.length !== 1) {
        throw new BusinessRuleError(
            'Bahan utama affal packing tidak dapat ditentukan. Tandai tepat satu bahan utama KG pada varian produk.',
            { eligibleCandidates: eligible.length },
            'PACKING_SCRAP_MATERIAL_AMBIGUOUS',
        );
    }
    return eligible[0].productVariantId;
}

function isWholeBalPackagingMaterial(item: MaterialLike): boolean {
    const productType = item.productVariant?.product?.productType;
    const primaryUnit = item.productVariant?.primaryUnit;
    const attributes = item.productVariant?.attributes;
    const materialName = item.productVariant?.name?.toLowerCase() || '';
    const skuCode = item.productVariant?.skuCode?.toLowerCase() || '';
    const isKarungLike =
        materialName.includes('karung') || skuCode.includes('kar');

    if (hasFloorEnteredBalRule(attributes)) {
        return true;
    }

    // Piece-count materials (etiket, karung, etc.) use PCS
    return (
        primaryUnit === 'PCS' &&
        isKarungLike &&
        (productType === 'PACKAGING' ||
            productType === 'RAW_MATERIAL' ||
            !productType)
    );
}

export function resolveBackflushQuantity(params: {
    item: MaterialLike;
    order: ProductionExecutionOrder;
    totalConsumed: number;
    isUsingPlanned: boolean;
    outputContext?: OutputBackflushContext;
}) {
    const { item, order, totalConsumed, isUsingPlanned, outputContext } =
        params;

    const ratio = isUsingPlanned
        ? Number(item.quantity) / Number(order.plannedQuantity)
        : Number(item.quantity) / Number(order.bom.outputQuantity);

    const enteredQuantity = outputContext?.enteredQuantity;

    if (
        order.bom?.category === 'PACKING' &&
        outputContext?.enteredUnit === 'BAL' &&
        typeof enteredQuantity === 'number' &&
        Number.isFinite(enteredQuantity) &&
        isWholeBalPackagingMaterial(item)
    ) {
        return Math.floor(enteredQuantity);
    }

    return totalConsumed * ratio;
}

export async function backflushMaterials(params: {
    tx: Prisma.TransactionClient;
    order: ProductionExecutionOrder;
    productionOrderId: string;
    totalConsumed: number;
    reference: string;
    userId?: string;
    outputContext?: OutputBackflushContext;
    executionId?: string;
    actualPackagingIds?: string[];
}) {
    const {
        tx,
        order,
        productionOrderId,
        totalConsumed,
        reference,
        userId,
        outputContext,
    } = params;
    const packingScrapKg =
        order.bom?.category === 'PACKING'
            ? Number(outputContext?.scrapQuantityKg ?? 0)
            : 0;
    if (totalConsumed <= 0 && packingScrapKg <= 0) {
        return;
    }

    if (order.materialConsumptionMode === 'DIRECT' && order.plannedMaterials.length === 0) {
        throw new BusinessRuleError('Rencana bahan pemakaian langsung tidak tersedia.', {}, 'DIRECT_MATERIAL_PLAN_REQUIRED');
    }

    const itemsToBackflush = (
        order.plannedMaterials.length > 0
            ? order.plannedMaterials
            : order.bom?.items || []
    ) as MaterialLike[];
    const isUsingPlanned = order.plannedMaterials.length > 0;

    if (itemsToBackflush.length === 0) {
        return;
    }

    const packingScrapMaterialId =
        packingScrapKg > 0
            ? resolvePackingScrapMaterialId(itemsToBackflush)
            : null;

    let rawMaterialValue = new Prisma.Decimal(0);
    let postedMaterialValue = new Prisma.Decimal(0);
    for (const item of itemsToBackflush) {
        if (params.actualPackagingIds?.includes(item.productVariantId)) continue;
        const consumptionLocationId = await resolveMaterialLocation(
            tx,
            order,
            item.productVariantId,
        );

        // Check if this material has already been manually issued by the warehouse team (Fase C guard)
        const manualIssueMovement = await tx.stockMovement.findFirst({
            where: {
                productionOrderId,
                productVariantId: item.productVariantId,
                type: MovementType.OUT,
                reference: {
                    startsWith: 'PROD-ISSUE-',
                },
            },
        });

        const consolIssueMovement = await tx.stockMovement.findFirst({
            where: {
                productionOrderId,
                productVariantId: item.productVariantId,
                type: MovementType.OUT,
                reference: {
                    startsWith: 'PROD-CONSOL-',
                },
            },
        });

        if (manualIssueMovement || consolIssueMovement) {
            if (order.materialConsumptionMode === 'DIRECT') {
                throw new BusinessRuleError('SPK pemakaian langsung memiliki issue manual yang bertentangan. Hubungi admin.', { productionOrderId }, 'DIRECT_MATERIAL_CONFLICT');
            }
            console.log(
                `Guard: Skipping backflush for ${item.productVariantId} on PO ${productionOrderId} because it was manually issued.`,
            );
            continue;
        }

        const proportionalBase =
            order.bom?.category === 'PACKING'
                ? outputContext?.baseQuantity ?? totalConsumed
                : totalConsumed;
        const qtyToDeduct =
            resolveBackflushQuantity({
                item,
                order,
                totalConsumed: proportionalBase,
                isUsingPlanned,
                outputContext,
            }) +
            (item.productVariantId === packingScrapMaterialId
                ? packingScrapKg
                : 0);

        if (qtyToDeduct <= 0.0001) {
            continue;
        }

        await InventoryCoreService.validateAndLockStock(
            tx,
            consumptionLocationId,
            item.productVariantId,
            qtyToDeduct,
        );
        await InventoryCoreService.deductStock(
            tx,
            consumptionLocationId,
            item.productVariantId,
            qtyToDeduct,
        );

        if (params.executionId) {
            const source = await tx.location.findUniqueOrThrow({ where: { id: consumptionLocationId } });
            if (source.locationType !== 'INTERNAL' && !order.isMaklon) throw new BusinessRuleError('Bahan produksi milik perusahaan harus bersumber dari stok internal.');
            if (order.isMaklon) {
                const customerOrder = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId }, select: { maklonCustomerId: true } });
                if (!source.packagingOwnerCustomerId || source.packagingOwnerCustomerId !== customerOrder.maklonCustomerId) {
                    throw new BusinessRuleError('Pemilik bahan maklon belum terverifikasi. Jangan memakai saldo pelanggan lain atau saldo gabungan.');
                }
            }
        }
        const sourceUnitCost = await resolveSourceUnitCost(
            tx,
            consumptionLocationId,
            item.productVariantId,
            order.isMaklon,
        );

        const movement = await tx.stockMovement.create({
            data: {
                type: MovementType.OUT,
                productVariantId: item.productVariantId,
                fromLocationId: consumptionLocationId,
                quantity: qtyToDeduct,
                // Explicit zero, never NULL: a NULL cost lets the journal fall back to a
                // master or sale price and fund WIP with value no stock carried.
                cost: sourceUnitCost,
                productionExecutionId: params.executionId,
                companyOwned: params.executionId ? !order.isMaklon : undefined,
                packagingOwnerCustomerId: params.executionId && order.isMaklon
                    ? (await tx.location.findUniqueOrThrow({ where: { id: consumptionLocationId }, select: { packagingOwnerCustomerId: true } })).packagingOwnerCustomerId
                    : undefined,
                reference,
                productionOrderId,
            },
        });
        await AccountingService.recordInventoryMovement(movement, tx);
        // Match the persisted movement's quantity/cost scales and each journal's
        // cents. Carry only this execution's representation difference forward.
        const rawValue = new Prisma.Decimal(qtyToDeduct).toDecimalPlaces(4)
            .mul(new Prisma.Decimal(sourceUnitCost).toDecimalPlaces(4));
        rawMaterialValue = rawMaterialValue.plus(rawValue);
        postedMaterialValue = postedMaterialValue.plus(rawValue.toDecimalPlaces(2));

        // Convert warehouse STAGED (transfer ke WIP) into ISSUED for actual consumption,
        // so progress stays correct (STAGED+ISSUED) and HPP only counts ISSUED.
        let remainingToConvert = qtyToDeduct;
        const stagedIssues = await tx.materialIssue.findMany({
            where: {
                productionOrderId,
                productVariantId: item.productVariantId,
                status: 'STAGED',
            },
            orderBy: { issuedAt: 'asc' },
        });

        for (const staged of stagedIssues) {
            if (remainingToConvert <= 0.0001) break;
            const stagedQty = Number(staged.quantity);
            if (stagedQty <= 0.0001) continue;

            if (params.executionId) {
                const allocated = Math.min(stagedQty, remainingToConvert);
                await tx.materialIssue.update({ where: { id: staged.id }, data: { quantity: { decrement: allocated } } });
                await tx.materialIssue.create({ data: {
                    productionOrderId, productVariantId: item.productVariantId,
                    quantity: allocated, locationId: consumptionLocationId,
                    productionExecutionId: params.executionId, stagedSourceId: staged.id,
                    status: 'ISSUED', createdById: userId,
                } });
                remainingToConvert -= allocated;
            } else if (stagedQty <= remainingToConvert + 0.0001) {
                await tx.materialIssue.update({
                    where: { id: staged.id },
                    data: {
                        status: 'ISSUED',
                        locationId: consumptionLocationId,
                    },
                });
                remainingToConvert -= stagedQty;
            } else {
                // Partial consume: shrink STAGED, create ISSUED for consumed slice
                await tx.materialIssue.update({
                    where: { id: staged.id },
                    data: { quantity: stagedQty - remainingToConvert },
                });
                await tx.materialIssue.create({
                    data: {
                        productionOrderId,
                        productVariantId: item.productVariantId,
                        quantity: remainingToConvert,
                        locationId: consumptionLocationId,
                        status: 'ISSUED',
                        createdById: userId,
                    },
                });
                remainingToConvert = 0;
            }
        }

        // Pure backflush (no prior staging) or over-consumption beyond staged qty
        if (remainingToConvert > 0.0001) {
            await tx.materialIssue.create({
                data: {
                    productionOrderId,
                    productVariantId: item.productVariantId,
                    quantity: remainingToConvert,
                    locationId: consumptionLocationId,
                    productionExecutionId: params.executionId,
                    status: 'ISSUED',
                    createdById: userId,
                },
            });
        }
    }
    return { roundingAdjustment: postedMaterialValue.minus(rawMaterialValue.toDecimalPlaces(2)).toNumber() };
}
