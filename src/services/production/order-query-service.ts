import { prisma } from '@/lib/core/prisma';
import { ISSUABLE_MATERIAL_TYPES } from '@/lib/constants/products';
import {
    MACHINE_STAGE_MAP_SETTING_KEY,
    parseMachineStageMap,
} from '@/lib/production/machine-compatibility';
import { Ok, Err, Result } from '@/lib/utils/result';
import { resolveMaterialSources } from './material-source-resolver';

/** Read-only initialization and material preview queries for production orders. */
export class ProductionOrderQueryService {
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
}
