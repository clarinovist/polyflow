import { prisma } from '@/lib/core/prisma';
import {
    CreateProductionOrderValues,
    UpdateProductionOrderValues,
} from '@/lib/schemas/production';
import {
    ProductionStatus,
    MachineType,
    BomCategory,
    SalesOrderType,
    Prisma,
    ReservationStatus,
    ReservationType,
} from '@prisma/client';

import { ISSUABLE_MATERIAL_TYPES } from '@/lib/constants/products';
import { resolveMaterialSources } from './material-source-resolver';
import {
    BusinessRuleError,
    NotFoundError,
    ProductionRuleViolationError,
    ValidationError,
} from '@/lib/errors/errors';
import { Ok, Err, Result } from '@/lib/utils/result';
import { createProductionOrderWithGeneratedNumber } from './order-number-service';
import {
    isInactiveLocation,
    isRiskyOutputLocation,
    resolveSourceLocationId,
    stageFromBomCategory,
} from '@/lib/locations/resolve-location';
import {
    assertMachineCapableForOrder,
    assertRoutedOrderCanStart,
    ensureRoutedOrderWipReservation,
    syncProductionRunStatusFromOrders,
} from './routing-execution-guard';
import {
    MACHINE_STAGE_MAP_SETTING_KEY,
    isMachineCompatibleWithCategory,
    parseMachineStageMap,
} from '@/lib/production/machine-compatibility';

/**
 * Generic (non-routed) SPK: machine type must match the BOM category,
 * honoring the tenant override map. Routed SPKs are validated separately by
 * assertMachineCapableForOrder (capability table first). Closes the assign /
 * reassign path where any active machine could be attached to any SPK.
 */
async function assertGenericMachineCompatibleWithBom(
    tx: Prisma.TransactionClient,
    machineId: string,
    bomId: string,
): Promise<void> {
    const [machine, bom, setting] = await Promise.all([
        tx.machine.findUnique({
            where: { id: machineId },
            select: { type: true },
        }),
        tx.bom.findUnique({
            where: { id: bomId },
            select: { category: true },
        }),
        tx.appSetting.findUnique({
            where: { key: MACHINE_STAGE_MAP_SETTING_KEY },
            select: { value: true },
        }),
    ]);
    if (!machine || !bom) return;

    const stageMap = parseMachineStageMap(setting?.value);
    if (!isMachineCompatibleWithCategory(machine.type, bom.category, stageMap)) {
        throw new BusinessRuleError(
            `Mesin ${machine.type} tidak compatible dengan stage ${bom.category}. Pilih mesin sesuai stage SPK.`,
            { machineType: machine.type, bomCategory: bom.category },
            'MACHINE_NOT_COMPATIBLE',
        );
    }
}

export class ProductionOrderService {
    /**
     * Get Initialization Data for Production Forms
     */
    static async getInitData() {
        // Run in parallel
        const [
            boms,
            machines,
            locations,
            employees,
            workShifts,
            rawMaterials,
            rawMaterialStock,
            customers,
            machineStageSetting,
        ] = await Promise.all([
            prisma.bom.findMany({
                where: { isActive: true },
                include: {
                    productVariant: {
                        include: { product: true },
                    },
                },
            }),
            prisma.machine.findMany({
                where: { status: 'ACTIVE' },
            }),
            prisma.location.findMany({ orderBy: { name: 'asc' } }),
            prisma.employee.findMany({
                orderBy: { name: 'asc' },
            }),
            prisma.workShift.findMany({
                where: { status: 'ACTIVE' },
                orderBy: { startTime: 'asc' },
            }),
            prisma.productVariant.findMany({
                where: {
                    archivedAt: null,
                    product: {
                        productType: { in: [...ISSUABLE_MATERIAL_TYPES] },
                    },
                },
                include: {
                    product: true,
                },
                orderBy: { name: 'asc' },
            }),
            // Stock per (raw material, warehouse) — feeds the "Tambah bahan"
            // picker so it can show availability before the user commits a qty.
            prisma.inventory.findMany({
                where: {
                    productVariant: {
                        product: {
                            productType: { in: [...ISSUABLE_MATERIAL_TYPES] },
                        },
                    },
                    quantity: { gt: 0 },
                },
                select: {
                    productVariantId: true,
                    locationId: true,
                    quantity: true,
                },
            }),
            prisma.customer.findMany({
                orderBy: { name: 'asc' },
            }),
            prisma.appSetting.findUnique({
                where: { key: MACHINE_STAGE_MAP_SETTING_KEY },
            }),
        ]);

        // Filter employees by role
        const operators = employees.filter((e) => e.role === 'OPERATOR');
        const helpers = employees.filter(
            (e) => e.role === 'HELPER' || e.role === 'PACKER',
        );

        return {
            boms,
            machines,
            locations,
            operators,
            helpers,
            workShifts,
            rawMaterials,
            rawMaterialStock,
            customers,
            machineStageMap: parseMachineStageMap(machineStageSetting?.value),
        };
    }

    /**
     * Calculate BOM Requirements with Stock Check
     */
    static async getBomWithInventory(
        bomId: string,
        sourceLocationId: string,
        plannedQuantity: number,
    ): Promise<
        Result<{
            data: unknown[];
            meta: {
                requestedSourceLocationId: string;
                suggestedSourceLocationId: string | null;
                suggestedSourceLocationName: string | null;
            };
        }>
    > {
        if (!bomId || plannedQuantity <= 0)
            return Err(new Error('Invalid parameters'));

        const bom = await prisma.bom.findUnique({
            where: { id: bomId },
            include: {
                items: {
                    include: {
                        productVariant: { include: { product: true } },
                    },
                },
            },
        });

        if (!bom) return Err(new Error('Recipe not found'));

        const requirements = bom.items.map((item) => ({
            item,
            requiredQty:
                (Number(item.quantity) / Number(bom.outputQuantity)) *
                plannedQuantity,
        }));

        // Each material resolves its own warehouse: packaging supplies and WIP
        // batches do not live where raw materials do.
        const resolutions = await resolveMaterialSources({
            materials: requirements.map(({ item, requiredQty }) => ({
                productVariantId: item.productVariantId,
                productType: item.productVariant.product?.productType,
                requiredQty,
            })),
            fallbackLocationId: sourceLocationId || null,
        });
        const resolutionByVariant = new Map(
            resolutions.map((r) => [r.productVariantId, r]),
        );

        const materialRequirements = requirements.map(
            ({ item, requiredQty }) => {
                const resolved = resolutionByVariant.get(item.productVariantId);

                return {
                    productVariantId: item.productVariantId,
                    name: item.productVariant.name,
                    unit: item.productVariant.primaryUnit,
                    stdQty: item.quantity.toNumber(),
                    bomOutput: bom.outputQuantity.toNumber(),
                    requiredQty,
                    currentStock: resolved?.stockAtSource ?? 0,
                    totalStock: resolved?.totalStock ?? 0,
                    sourceLocationId: resolved?.sourceLocationId ?? '',
                    sourceLocationName: resolved?.sourceLocationName ?? '',
                };
            },
        );

        // Only flag a different warehouse when EVERY material resolved away from
        // the requested one — otherwise the per-item column already says it.
        const resolvedIds = new Set(
            materialRequirements
                .map((m) => m.sourceLocationId)
                .filter((id) => id !== ''),
        );
        const singleAlternative =
            sourceLocationId &&
            resolvedIds.size === 1 &&
            !resolvedIds.has(sourceLocationId)
                ? materialRequirements.find((m) => m.sourceLocationId !== '')
                : null;

        return Ok({
            data: materialRequirements,
            meta: {
                requestedSourceLocationId: sourceLocationId,
                suggestedSourceLocationId:
                    singleAlternative?.sourceLocationId || null,
                suggestedSourceLocationName:
                    singleAlternative?.sourceLocationName || null,
            },
        });
    }

    /**
     * Create a new Production Order
     */
    static async createOrder(
        data: CreateProductionOrderValues & {
            userId?: string;
            clientRequestId?: string;
        },
        tx?: Prisma.TransactionClient,
    ) {
        const {
            bomId,
            plannedQuantity,
            plannedStartDate,
            plannedEndDate,
            locationId,
            orderNumber,
            notes,
            salesOrderId,
            userId,
            machineId,
            priority,
            isMaklon,
            maklonCustomerId,
            estimatedConversionCost,
            plannedEnteredQuantity,
            plannedEnteredUnit,
            plannedConversionFactorSnapshot,
            materialSourceLocationId,
            clientRequestId,
        } = data;

        const execute = async (transaction: Prisma.TransactionClient) => {
            // 0. BOM must exist and be active for new production orders
            const bomForOrder = await transaction.bom.findUnique({
                where: { id: bomId },
                select: { id: true, isActive: true, category: true },
            });
            if (!bomForOrder) {
                throw new NotFoundError('Resep', bomId);
            }
            if (!bomForOrder.isActive) {
                throw new BusinessRuleError(
                    'Resep ini sudah nonaktif dan tidak bisa dipakai untuk Production Order baru. Aktifkan kembali atau pilih resep aktif lain.',
                    { bomId },
                    'BOM_INACTIVE',
                );
            }

            // Validate output locationId
            if (locationId) {
                const targetLoc = await transaction.location.findUnique({
                    where: { id: locationId },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        locationPurpose: true,
                    },
                });
                if (!targetLoc) {
                    throw new NotFoundError('Location', locationId);
                }
                if (isInactiveLocation(targetLoc)) {
                    throw new BusinessRuleError(
                        'Tidak bisa memakai lokasi nonaktif sebagai output SPK.',
                        { locationId, slug: targetLoc.slug },
                        'INVALID_LOCATION',
                    );
                }
                if (isRiskyOutputLocation(targetLoc)) {
                    throw new BusinessRuleError(
                        'Lokasi output tidak valid untuk SPK (tidak boleh menggunakan Gudang Bahan Baku atau Gudang Supplies Kemasan). Silakan pilih Gudang Barang Jadi atau Area Proses.',
                        { locationId, locationName: targetLoc.name },
                        'RISKY_OUTPUT_LOCATION',
                    );
                }

                // Validate location purpose matches product type
                const bomWithProduct = await transaction.bom.findUnique({
                    where: { id: bomId },
                    select: {
                        productVariant: {
                            select: {
                                product: { select: { productType: true } },
                            },
                        },
                    },
                });
                if (bomWithProduct?.productVariant?.product?.productType) {
                    const productType =
                        bomWithProduct.productVariant.product.productType;
                    const purpose = targetLoc.locationPurpose;
                    const isValidCombo =
                        // FINISHED_GOOD can land in FG or Kiyowo packing floor (PACKING, not supplies — risky check already blocks supplies)
                        (productType === 'FINISHED_GOOD' &&
                            (purpose === 'FINISHED_GOOD' ||
                                purpose === 'PACKING')) ||
                        // INTERMEDIATE/WIP: MIXING is alias of WIP per resolve-location.ts
                        (productType === 'INTERMEDIATE' &&
                            (purpose === 'WIP' || purpose === 'MIXING')) ||
                        (productType === 'WIP' &&
                            (purpose === 'WIP' || purpose === 'MIXING')) ||
                        // PACKAGING products (Kiyowo bag output) land in packing_area; Melindo fallback FG
                        (productType === 'PACKAGING' &&
                            (purpose === 'PACKING' ||
                                purpose === 'FINISHED_GOOD')) ||
                        (productType === 'SCRAP' && purpose === 'SCRAP') ||
                        purpose === 'GENERAL_PURPOSE';
                    if (!isValidCombo) {
                        throw new BusinessRuleError(
                            `Lokasi output "${targetLoc.name}" (${purpose}) tidak cocok untuk produk tipe ${productType}. Produk ${productType} seharusnya diproduksi di lokasi dengan purpose ${productType === 'FINISHED_GOOD' ? 'FINISHED_GOOD' : 'WIP'}.`,
                            {
                                locationId,
                                locationPurpose: purpose,
                                productType,
                            },
                            'LOCATION_PRODUCT_MISMATCH',
                        );
                    }
                }
            }

            // 1. Validate Machine Type against BOM Category if machineId is provided
            // ── Flexible routing: if order has routeStepId / processCodeSnapshot, prefer capability table ──
            if (machineId) {
                const machine = await transaction.machine.findUnique({
                    where: { id: machineId },
                    select: { type: true },
                });

                if (machine) {
                    const routeStepId = (
                        data as unknown as { routeStepId?: string }
                    ).routeStepId;
                    let capabilityOk: boolean | null = null;

                    if (routeStepId) {
                        const rs =
                            await transaction.productionRouteStep.findUnique({
                                where: { id: routeStepId },
                                select: { processId: true },
                            });
                        if (rs) {
                            const cap =
                                await transaction.machineProcessCapability.findUnique(
                                    {
                                        where: {
                                            machineId_processId: {
                                                machineId,
                                                processId: rs.processId,
                                            },
                                        },
                                    },
                                );
                            const hasAnyCapForProcess =
                                await transaction.machineProcessCapability.findFirst(
                                    {
                                        where: { processId: rs.processId },
                                        select: { id: true },
                                    },
                                );
                            // If process has capabilities defined, enforce them; otherwise fallback to legacy
                            if (hasAnyCapForProcess) {
                                capabilityOk = !!cap;
                            }
                        }
                    }

                    if (capabilityOk === false) {
                        throw new ProductionRuleViolationError(
                            `Mesin tidak capable untuk process step ini`,
                            { machineId, routeStepId },
                        );
                    }

                    if (capabilityOk === null) {
                        // Legacy fallback
                        const bomCategory = bomForOrder.category;
                        const isTypeMatch =
                            (bomCategory === BomCategory.MIXING &&
                                machine.type === MachineType.MIXER) ||
                            (bomCategory === BomCategory.EXTRUSION &&
                                (machine.type === MachineType.EXTRUDER ||
                                    machine.type === MachineType.REWINDER)) ||
                            (bomCategory === BomCategory.PACKING &&
                                (machine.type === MachineType.PACKER ||
                                    machine.type === MachineType.GRANULATOR)) ||
                            bomCategory === BomCategory.REWORK || // Rework is manual, any machine is OK
                            (bomCategory === BomCategory.STANDARD &&
                                (machine.type === MachineType.EXTRUDER ||
                                    machine.type === MachineType.MIXER)); // Standard fallback

                        if (!isTypeMatch) {
                            throw new ProductionRuleViolationError(
                                `Machine type ${machine.type} is not compatible with stage ${bomCategory}`,
                                { machineType: machine.type, bomCategory },
                            );
                        }
                    }
                }
            }
            // 2. Calculate Materials (Standard or Flexible)
            let materialsToCreate = data.items || [];

            if (materialsToCreate.length === 0) {
                // Fetch BOM items to calculate defaults
                const bom = await transaction.bom.findUnique({
                    where: { id: bomId },
                    include: { items: true },
                });

                if (bom) {
                    materialsToCreate = bom.items.map((item) => ({
                        productVariantId: item.productVariantId,
                        quantity:
                            (Number(item.quantity) /
                                Number(bom.outputQuantity)) *
                            Number(plannedQuantity),
                    }));
                }
            }

            // 3. Determine Initial Status based on Stock Availability
            // Shortage check uses materialSourceLocationId (source warehouse), NOT output locationId.
            // Falls back to resolve from BOM category if not provided.
            let initialStatus: ProductionStatus = ProductionStatus.DRAFT;
            if (materialsToCreate.length > 0) {
                const variantIds = materialsToCreate.map(
                    (m) => m.productVariantId,
                );

                // Resolve source location for shortage check
                let shortageLocationId = materialSourceLocationId;
                if (!shortageLocationId) {
                    // Fallback: resolve default source from BOM category + maklon
                    const allLocations = await transaction.location.findMany({
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            locationPurpose: true,
                        },
                    });
                    const stage = stageFromBomCategory(bomForOrder.category);
                    shortageLocationId = resolveSourceLocationId(
                        allLocations,
                        stage,
                        !!isMaklon,
                    );
                }

                const variantTypes = await transaction.productVariant.findMany({
                    where: { id: { in: variantIds } },
                    select: {
                        id: true,
                        product: { select: { productType: true } },
                    },
                });
                const typeByVariant = new Map(
                    variantTypes.map((v) => [v.id, v.product?.productType]),
                );

                // Materials spread across warehouses: a packing order draws
                // supplies from the packaging store and product from FG. Judging
                // every line against one location reported stock on the shelf as
                // missing, so every packing order opened as WAITING_MATERIAL.
                const resolutions = await resolveMaterialSources({
                    materials: materialsToCreate.map((m) => ({
                        productVariantId: m.productVariantId,
                        productType: typeByVariant.get(m.productVariantId),
                        requiredQty: m.quantity,
                    })),
                    fallbackLocationId: shortageLocationId || null,
                    client: transaction,
                });

                if (resolutions.some((r) => r.isShortage)) {
                    initialStatus = ProductionStatus.WAITING_MATERIAL;
                }
            }

            // 4. Create Order
            const orderData = {
                bom: { connect: { id: bomId } },
                plannedQuantity,
                plannedStartDate,
                plannedEndDate,
                location: { connect: { id: locationId } },
                notes,
                status: initialStatus,
                priority: priority || 'NORMAL',
                actualQuantity: 0,
                plannedEnteredQuantity,
                plannedEnteredUnit,
                plannedConversionFactorSnapshot,
                salesOrder: salesOrderId
                    ? { connect: { id: salesOrderId } }
                    : undefined,
                createdBy: userId ? { connect: { id: userId } } : undefined,
                machine: machineId ? { connect: { id: machineId } } : undefined,
                isMaklon: isMaklon,
                maklonCustomer: maklonCustomerId
                    ? { connect: { id: maklonCustomerId } }
                    : undefined,
                estimatedConversionCost: estimatedConversionCost,
                clientRequestId: clientRequestId,
            } satisfies Omit<Prisma.ProductionOrderCreateInput, 'orderNumber'>;

            const newOrder = orderNumber
                ? await transaction.productionOrder.create({
                      data: {
                          ...orderData,
                          orderNumber,
                      },
                  })
                : await createProductionOrderWithGeneratedNumber(
                      transaction,
                      orderData,
                  );

            // 5. Create Material Requirements
            if (materialsToCreate.length > 0) {
                await transaction.productionMaterial.createMany({
                    data: materialsToCreate.map((item) => ({
                        productionOrderId: newOrder.id,
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                    })),
                });
            }

            return newOrder;
        };

        if (tx) {
            return await execute(tx);
        } else {
            return await prisma.$transaction(execute);
        }
    }

    /**
     * Create Production Order from Sales Order (Shortage)
     */
    static async createOrderFromSales(
        salesOrderId: string,
        productVariantId: string,
        quantity: number,
    ) {
        if (!salesOrderId || !productVariantId || quantity <= 0) {
            throw new ValidationError(
                'Parameter tidak valid: salesOrderId, productVariantId, dan quantity > 0 wajib diisi',
            );
        }

        // 1. Find default BOM
        const bom = await prisma.bom.findFirst({
            where: {
                productVariantId,
                isDefault: true,
                isActive: true,
            },
        });

        if (!bom) {
            throw new BusinessRuleError(
                'No default BOM found for this product. Please create one first.',
                { productVariantId },
                'MISSING_DEFAULT_BOM',
            );
        }

        // 2. Fetch Sales Order
        const so = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            select: {
                sourceLocationId: true,
                expectedDate: true,
                orderType: true,
                customerId: true,
            },
        });

        if (!so) throw new NotFoundError('Sales Order', salesOrderId);
        if (!so.sourceLocationId) {
            throw new BusinessRuleError(
                'Sales Order does not have a source location. A production location is required.',
                { salesOrderId },
                'MISSING_SOURCE_LOCATION',
            );
        }

        const isMaklon = so.orderType === SalesOrderType.MAKLON_JASA;

        // 3. Create PO
        return await this.createOrder({
            bomId: bom.id,
            plannedQuantity: quantity,
            plannedEnteredQuantity: undefined,
            plannedEnteredUnit: undefined,
            plannedConversionFactorSnapshot: undefined,
            plannedStartDate: new Date(),
            plannedEndDate: so.expectedDate || undefined,
            locationId: so.sourceLocationId!,
            salesOrderId,
            notes: `Auto-generated from Sales Order shortage${isMaklon ? ' (Maklon; source location treated as production location/default consumption location)' : ''}.`,
            isMaklon: isMaklon,
            maklonCustomerId: isMaklon ? so.customerId || undefined : undefined,
            estimatedConversionCost: 0,
        });
    }

    /**
     * Split Demand shortage from Sales Order into sibling daily/batch Production Orders
     */
    static async splitOrdersFromSales(data: {
        salesOrderId: string;
        productVariantId: string;
        batches: {
            plannedQuantity: number;
            plannedStartDate: Date;
            machineId?: string;
        }[];
        userId?: string;
    }) {
        const { salesOrderId, productVariantId, batches, userId } = data;

        if (
            !salesOrderId ||
            !productVariantId ||
            !batches ||
            batches.length === 0
        ) {
            throw new ValidationError(
                'salesOrderId, productVariantId, and at least one batch are required',
            );
        }

        // 1. Find default BOM
        const bom = await prisma.bom.findFirst({
            where: {
                productVariantId,
                isDefault: true,
                isActive: true,
            },
        });

        if (!bom) {
            throw new BusinessRuleError(
                'No default BOM found for this product. Please create one first.',
                { productVariantId },
                'MISSING_DEFAULT_BOM',
            );
        }

        // 2. Fetch Sales Order
        const so = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            select: {
                sourceLocationId: true,
                expectedDate: true,
                orderType: true,
                customerId: true,
            },
        });

        if (!so) throw new NotFoundError('Sales Order', salesOrderId);
        if (!so.sourceLocationId) {
            throw new BusinessRuleError(
                'Sales Order does not have a source location. A production location is required.',
                { salesOrderId },
                'MISSING_SOURCE_LOCATION',
            );
        }

        const isMaklon = so.orderType === SalesOrderType.MAKLON_JASA;

        return await prisma.$transaction(async (tx) => {
            // 3. Validate quantities
            const soItem = await tx.salesOrderItem.findFirst({
                where: { salesOrderId, productVariantId },
            });
            if (!soItem) {
                throw new NotFoundError(
                    'Sales Order Item',
                    `${salesOrderId}/${productVariantId}`,
                );
            }

            const existingPOs = await tx.productionOrder.findMany({
                where: {
                    salesOrderId,
                    bom: { productVariantId },
                    status: { not: 'CANCELLED' },
                },
                select: { plannedQuantity: true },
            });

            const totalPlannedQty = existingPOs.reduce(
                (sum, po) => sum + po.plannedQuantity.toNumber(),
                0,
            );
            const remainingToProduce = Math.max(
                0,
                soItem.quantity.toNumber() -
                    soItem.deliveredQty.toNumber() -
                    totalPlannedQty,
            );

            const sumBatchQty = batches.reduce(
                (sum, b) => sum + b.plannedQuantity,
                0,
            );
            if (sumBatchQty > remainingToProduce) {
                throw new BusinessRuleError(
                    `Requested production quantity (${sumBatchQty}) exceeds the remaining demand to produce (${remainingToProduce}) for this Sales Order item.`,
                    { sumBatchQty, remainingToProduce },
                    'EXCEEDS_REMAINING_DEMAND',
                );
            }

            // 4. Create sibling POs
            const createdOrders = [];
            for (const batch of batches) {
                if (batch.plannedQuantity <= 0) {
                    throw new ValidationError(
                        'Qty rencana batch harus positif',
                    );
                }

                const po = await this.createOrder(
                    {
                        bomId: bom.id,
                        plannedQuantity: batch.plannedQuantity,
                        plannedStartDate: new Date(batch.plannedStartDate),
                        plannedEndDate: so.expectedDate || undefined,
                        locationId: so.sourceLocationId!,
                        salesOrderId,
                        machineId: batch.machineId,
                        notes: `Split batch from Sales Order shortage${isMaklon ? ' (Maklon)' : ''}.`,
                        isMaklon: isMaklon,
                        maklonCustomerId: isMaklon
                            ? so.customerId || undefined
                            : undefined,
                        estimatedConversionCost: 0,
                        userId,
                    },
                    tx,
                );
                createdOrders.push(po);
            }

            return createdOrders;
        });
    }

    /**
     * Quick Create Production Order for Daily Production
     * Wraps createOrder() with daily-production defaults:
     * - Auto-sets plannedStartDate to today
     * - Auto-sets status to RELEASED (skips DRAFT)
     * - Validates machine type vs BOM category
     */
    static async quickCreateOrder(data: {
        bomId: string;
        plannedQuantity: number;
        machineId: string;
        locationId: string;
        userId?: string;
        notes?: string;
        priority?: 'URGENT' | 'NORMAL' | 'LOW';
        clientRequestId?: string;
    }) {
        const {
            bomId,
            plannedQuantity,
            machineId,
            locationId,
            userId,
            notes,
            priority,
            clientRequestId,
        } = data;

        if (
            !bomId ||
            !Number.isFinite(plannedQuantity) ||
            plannedQuantity <= 0 ||
            !machineId ||
            !locationId
        ) {
            throw new ValidationError(
                'BOM, jumlah, mesin, dan lokasi wajib diisi',
            );
        }

        // Validate machine type vs BOM category (reuse logic from createOrder)
        const [machine, bom] = await Promise.all([
            prisma.machine.findUnique({
                where: { id: machineId },
                select: { type: true, status: true },
            }),
            prisma.bom.findUnique({
                where: { id: bomId },
                select: { category: true },
            }),
        ]);

        if (!machine) {
            throw new NotFoundError('Mesin produksi tidak ditemukan');
        }
        if (machine.status !== 'ACTIVE') {
            throw new ProductionRuleViolationError(
                'Mesin yang dipilih tidak aktif dan tidak dapat digunakan',
                { machineId, machineStatus: machine.status },
            );
        }
        if (!bom) {
            throw new NotFoundError('BOM produksi tidak ditemukan');
        }

        if (machine && bom) {
            const isTypeMatch =
                (bom.category === BomCategory.MIXING &&
                    machine.type === MachineType.MIXER) ||
                (bom.category === BomCategory.EXTRUSION &&
                    (machine.type === MachineType.EXTRUDER ||
                        machine.type === MachineType.REWINDER)) ||
                (bom.category === BomCategory.PACKING &&
                    (machine.type === MachineType.PACKER ||
                        machine.type === MachineType.GRANULATOR)) ||
                bom.category === BomCategory.REWORK ||
                (bom.category === BomCategory.STANDARD &&
                    (machine.type === MachineType.EXTRUDER ||
                        machine.type === MachineType.MIXER));

            if (!isTypeMatch) {
                throw new ProductionRuleViolationError(
                    `Machine type ${machine.type} is not compatible with stage ${bom.category}`,
                    { machineType: machine.type, bomCategory: bom.category },
                );
            }
        }

        // Create order with daily-production defaults
        const order = await this.createOrder({
            bomId,
            plannedQuantity,
            plannedStartDate: new Date(),
            locationId,
            machineId,
            userId,
            notes: notes || 'Quick produce — produksi harian',
            priority: priority || 'NORMAL',
            isMaklon: false,
            estimatedConversionCost: 0,
            clientRequestId,
        });

        // Auto-release: if order was created as DRAFT, set to RELEASED
        if (order.status === ProductionStatus.DRAFT) {
            await prisma.productionOrder.update({
                where: { id: order.id },
                data: { status: ProductionStatus.RELEASED },
            });
        }

        return order;
    }

    /**
     * Update Production Order
     */
    static async updateOrder(data: UpdateProductionOrderValues) {
        const {
            id,
            status,
            priority,
            actualQuantity,
            actualStartDate,
            actualEndDate,
            machineId,
            locationId,
            plannedStartDate,
        } = data;

        return prisma.$transaction(async (tx) => {
            const existing = await tx.productionOrder.findUnique({
                where: { id },
                select: {
                    status: true,
                    routeStepId: true,
                    productionRunId: true,
                    id: true,
                    routeSequenceSnapshot: true,
                    plannedQuantity: true,
                    materialSourceLocationId: true,
                    locationId: true,
                    machineId: true,
                    bomId: true,
                },
            });
            if (!existing) throw new NotFoundError('Production Order', id);

            if (locationId) {
                if (
                    existing.status === 'COMPLETED' ||
                    existing.status === 'CANCELLED'
                ) {
                    throw new BusinessRuleError(
                        'Lokasi output tidak bisa diubah untuk SPK yang sudah selesai atau dibatalkan.',
                        { status: existing.status, orderId: id },
                        'INVALID_ORDER_STATUS',
                    );
                }

                const location = await tx.location.findUnique({
                    where: { id: locationId },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        locationPurpose: true,
                    },
                });
                if (!location) throw new NotFoundError('Location', locationId);
                if (isInactiveLocation(location)) {
                    throw new BusinessRuleError(
                        'Tidak bisa memakai lokasi nonaktif sebagai output SPK.',
                        { locationId, slug: location.slug },
                        'INVALID_LOCATION',
                    );
                }
                if (isRiskyOutputLocation(location)) {
                    throw new BusinessRuleError(
                        'Lokasi output tidak valid untuk SPK (tidak boleh menggunakan Gudang Bahan Baku atau Gudang Supplies Kemasan). Silakan pilih Gudang Barang Jadi atau Area Proses.',
                        { locationId, locationName: location.name },
                        'RISKY_OUTPUT_LOCATION',
                    );
                }
            }

            // B3: every routed status transition is validated and persisted in this transaction.
            if (machineId && existing.routeStepId) {
                await assertMachineCapableForOrder(
                    tx,
                    existing as never,
                    machineId,
                );
            } else if (machineId) {
                // Generic SPK: still must match machine type ↔ BOM category.
                await assertGenericMachineCompatibleWithBom(
                    tx,
                    machineId,
                    existing.bomId,
                );
            }

            // Readiness is only a start guard. Final transitions must be allowed to
            // complete/cancel even if inventory has since been consumed or moved.
            if (
                status &&
                existing.productionRunId &&
                existing.routeStepId &&
                (status === 'RELEASED' || status === 'IN_PROGRESS')
            ) {
                await assertRoutedOrderCanStart(tx, existing as never, status);
                await ensureRoutedOrderWipReservation(tx, existing as never);
            }

            const updated = await tx.productionOrder.update({
                where: { id },
                data: {
                    status,
                    priority,
                    actualQuantity,
                    actualStartDate,
                    actualEndDate,
                    machineId,
                    ...(locationId ? { locationId } : {}),
                    plannedStartDate,
                },
            });

            if (status && existing.productionRunId && existing.routeStepId) {
                if (status === 'COMPLETED' || status === 'CANCELLED') {
                    await tx.stockReservation.updateMany({
                        where: {
                            reservedFor: ReservationType.PRODUCTION_ORDER,
                            referenceId: id,
                            status: {
                                in: [
                                    ReservationStatus.ACTIVE,
                                    ReservationStatus.WAITING,
                                ],
                            },
                        },
                        data: { status: ReservationStatus.CANCELLED },
                    });
                }
                await syncProductionRunStatusFromOrders(
                    tx,
                    existing.productionRunId,
                    {
                        triggerOrderId: id,
                        completedAt:
                            status === 'COMPLETED' ? new Date() : undefined,
                    },
                );
            }

            return updated;
        });
    }

    /**
     * Delete Production Order (Draft Only)
     */
    static async deleteOrder(id: string) {
        const order = await prisma.productionOrder.findUnique({
            where: { id },
            select: { status: true },
        });

        if (!order) {
            throw new NotFoundError('Production Order', id);
        }

        if (order.status !== 'DRAFT' && order.status !== 'WAITING_MATERIAL') {
            throw new BusinessRuleError(
                'Only DRAFT or WAITING_MATERIAL orders can be deleted.',
                { status: order.status, orderId: id },
                'INVALID_ORDER_STATUS',
            );
        }

        await prisma.$transaction(async (tx) => {
            await tx.stockMovement.updateMany({
                where: { productionOrderId: id },
                data: { productionOrderId: null },
            });
            await tx.materialIssue.deleteMany({
                where: { productionOrderId: id },
            });
            await tx.scrapRecord.deleteMany({
                where: { productionOrderId: id },
            });
            await tx.qualityInspection.deleteMany({
                where: { productionOrderId: id },
            });
            await tx.productionShift.deleteMany({
                where: { productionOrderId: id },
            });
            await tx.productionMaterial.deleteMany({
                where: { productionOrderId: id },
            });
            await tx.productionOrder.delete({ where: { id } });
        });
    }

    /**
     * Add Shift to Production Order
     */
    static async addShift(data: {
        productionOrderId: string;
        shiftName: string;
        startTime: Date;
        endTime: Date;
        operatorId?: string;
        helperIds?: string[];
        machineId?: string;
    }) {
        await prisma.$transaction(async (tx) => {
            await tx.productionShift.create({
                data: {
                    productionOrderId: data.productionOrderId,
                    shiftName: data.shiftName,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    operatorId: data.operatorId,
                    helpers: data.helperIds
                        ? {
                              connect: data.helperIds.map((id) => ({ id })),
                          }
                        : undefined,
                },
            });

            if (data.machineId) {
                await tx.productionOrder.update({
                    where: { id: data.productionOrderId },
                    data: { machineId: data.machineId },
                });
            }
        });
    }

    /**
     * Delete Production Shift
     */
    static async deleteShift(shiftId: string) {
        await prisma.productionShift.delete({
            where: { id: shiftId },
        });
    }
}
