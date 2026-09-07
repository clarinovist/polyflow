import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { isEligibleMaterialSourceLocation } from '@/lib/locations/resolve-location';
import {
    createProductionOrderSchema,
    type CreateProductionOrderValues,
} from '@/lib/schemas/production';

/** Validate even service callers that bypass the server action's schema. */
export async function validateDirectMaterialOrder(
    tx: Prisma.TransactionClient,
    data: CreateProductionOrderValues,
    category: string,
): Promise<boolean> {
    createProductionOrderSchema.parse(data);
    if (category !== 'PACKING') {
        throw new BusinessRuleError(
            'Pemakaian langsung per bahan hanya tersedia untuk SPK packing.',
            {},
            'DIRECT_PACKING_ONLY',
        );
    }
    const items = data.items || [];
    const locationIds = [
        ...new Set(items.map((item) => item.sourceLocationId!)),
    ];
    const locations = await tx.location.findMany({
        where: { id: { in: locationIds } },
    });
    const eligibleIds = new Set(
        locations
            .filter(
                (location) =>
                    location.locationType === 'INTERNAL' &&
                    isEligibleMaterialSourceLocation(location),
            )
            .map((location) => location.id),
    );
    if (locationIds.some((id) => !eligibleIds.has(id))) {
        throw new BusinessRuleError(
            'Lokasi asal bahan tidak ditemukan atau tidak boleh dipakai.',
            {},
            'INVALID_MATERIAL_SOURCE',
        );
    }
    const stock = await tx.inventory.findMany({
        where: {
            OR: items.map((item) => ({
                productVariantId: item.productVariantId,
                locationId: item.sourceLocationId,
            })),
        },
        select: { productVariantId: true, locationId: true, quantity: true },
    });
    return items.some(
        (item) =>
            item.quantity >
            Number(
                stock.find(
                    (row) =>
                        row.productVariantId === item.productVariantId &&
                        row.locationId === item.sourceLocationId,
                )?.quantity || 0,
            ),
    );
}

/** DIRECT orders must never enter manual-issue/staging paths. */
export function assertTransferMaterialOrder(
    order: { materialConsumptionMode?: string } | null,
) {
    if (order?.materialConsumptionMode === 'DIRECT') {
        throw new BusinessRuleError(
            'SPK memakai bahan langsung dari gudang masing-masing. Catat hasil produksi untuk memotong stok; transfer atau issue manual tidak berlaku.',
            {},
            'DIRECT_MATERIAL_ORDER',
        );
    }
}