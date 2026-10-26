import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';
import { packagingUnitLabel } from '@/lib/production/packaging-material';

/**
 * Kiosk "Kemasan" step: pure helpers shared by the wizard step and the
 * Fokus SPK panel. Counts are never inferred from output; the estimate is
 * a stock warning only (decision 2026-10-26).
 */

export interface KioskPackagingStock {
    id: string;
    productVariantId: string;
    name: string;
    unit: string;
    locationId: string;
    locationName: string;
    ownerCustomerId: string | null;
    ownerName: string | null;
    quantity: number;
}

export interface KioskPackagingBrand {
    id: string;
    name: string;
    labelVariantId: string | null;
    labelName: string | null;
}

export interface KioskPackagingUsage {
    productVariantId: string;
    name: string;
    unit: string;
    quantity: number;
    lastSourceLocationId: string | null;
}

export interface KioskPackagingContext {
    enabled: boolean;
    baseVariantId: string;
    /** The SKU an MRP/sales SPK must produce; other brands are not allowed. */
    fixedBrandId: string | null;
    brands: KioskPackagingBrand[];
    plannedPackagingIds: string[];
    stock: KioskPackagingStock[];
    usage: KioskPackagingUsage[];
    /** Good output already posted on this SPK, in the base unit. */
    producedBaseQty: number;
}

type Group = PackagedOutputValues['groups'][number];
type Row = Group['packaging'][number];

const QUANTITY_TOLERANCE = 0.0001;
const ESTIMATE_DECIMALS = 4;

const formatNumber = (value: number) =>
    value.toLocaleString('id-ID', { maximumFractionDigits: ESTIMATE_DECIMALS });
const roundEstimate = (value: number) =>
    Number(value.toFixed(ESTIMATE_DECIMALS));

function brandById(context: KioskPackagingContext, brandId: string) {
    return context.brands.find((brand) => brand.id === brandId);
}

/** Display name of a packaging material in this context. */
export function materialName(
    context: KioskPackagingContext,
    productVariantId: string,
) {
    return (
        context.stock.find((row) => row.productVariantId === productVariantId)
            ?.name ??
        context.usage.find((row) => row.productVariantId === productVariantId)
            ?.name ??
        context.brands.find(
            (brand) => brand.labelVariantId === productVariantId,
        )?.labelName ??
        'kemasan'
    );
}

function findStock(
    context: KioskPackagingContext,
    productVariantId: string,
    locationId: string,
) {
    return context.stock.find(
        (row) =>
            row.productVariantId === productVariantId &&
            row.locationId === locationId,
    );
}

/** Last source used on this SPK while it still has stock, else the largest stock. */
export function pickSource(
    context: KioskPackagingContext,
    productVariantId: string,
) {
    const lastUsed = context.usage.find(
        (row) => row.productVariantId === productVariantId,
    )?.lastSourceLocationId;
    const sources = context.stock.filter(
        (row) => row.productVariantId === productVariantId && row.quantity > 0,
    );
    return (
        sources.find((row) => row.locationId === lastUsed) ??
        [...sources].sort((a, b) => b.quantity - a.quantity)[0]
    );
}

export function newPackagingRow(
    context: KioskPackagingContext,
    productVariantId: string,
): Row {
    const source = pickSource(context, productVariantId);
    return {
        productVariantId,
        sourceLocationId: source?.locationId ?? '',
        ownerCustomerId: source?.ownerCustomerId ?? null,
        unit:
            source?.unit === 'KG' || source?.unit === 'PCS'
                ? source.unit
                : undefined,
        quantity: 0,
    };
}

function labelOf(context: KioskPackagingContext, brandId: string) {
    return brandById(context, brandId)?.labelVariantId ?? null;
}

/** Locations holding a material, for the source picker. */
export function sourcesFor(
    context: KioskPackagingContext,
    productVariantId: string,
) {
    return context.stock
        .filter((row) => row.productVariantId === productVariantId)
        .sort((a, b) => a.locationName.localeCompare(b.locationName, 'id'));
}

/** Labels belong to one brand each; never offer another brand's label. */
export function selectableStock(
    context: KioskPackagingContext,
    brandIds: string[],
) {
    const otherLabels = new Set(
        context.brands
            .filter(
                (brand) => !brandIds.includes(brand.id) && brand.labelVariantId,
            )
            .map((brand) => brand.labelVariantId),
    );
    return context.stock.filter(
        (row) => !otherLabels.has(row.productVariantId),
    );
}

/** Prefill: brand label, planned packaging, then what this SPK used before. Counts stay empty. */
export function buildInitialGroups(
    context: KioskPackagingContext,
    baseQty: number,
): Group[] {
    if (baseQty <= 0) return [];
    const brandId = context.fixedBrandId ?? context.baseVariantId;
    const label = labelOf(context, brandId);
    const ids = [
        ...(label ? [label] : []),
        ...context.plannedPackagingIds,
        ...context.usage.map((row) => row.productVariantId),
    ];
    const unique = [...new Set(ids)];
    return [
        {
            productVariantId: brandId,
            quantity: baseQty,
            packaging: unique.map((id) => newPackagingRow(context, id)),
        },
    ];
}

/** Changing a group's brand swaps its label row and keeps everything else. */
export function switchGroupBrand(
    context: KioskPackagingContext,
    groups: Group[],
    index: number,
    brandId: string,
): Group[] {
    const allLabels = new Set(
        context.brands.map((brand) => brand.labelVariantId).filter(Boolean),
    );
    const label = labelOf(context, brandId);
    return groups.map((group, i) => {
        if (i !== index) return group;
        const kept = group.packaging.filter(
            (row) => !allLabels.has(row.productVariantId),
        );
        return {
            ...group,
            productVariantId: brandId,
            packaging: label
                ? [newPackagingRow(context, label), ...kept]
                : kept,
        };
    });
}

function rowProblem(context: KioskPackagingContext, row: Row): string | null {
    if (!row.productVariantId) return 'Pilih kemasan untuk setiap baris.';
    const name = materialName(context, row.productVariantId);
    const stock = row.sourceLocationId
        ? findStock(context, row.productVariantId, row.sourceLocationId)
        : undefined;
    if (!stock) return `Pilih gudang asal untuk ${name}.`;
    if (!(row.quantity > 0)) return `Isi jumlah ${name} yang terpakai.`;
    if (stock.unit === 'PCS' && !Number.isInteger(row.quantity))
        return `Jumlah ${name} harus bilangan bulat.`;
    return null;
}

function stockProblem(
    context: KioskPackagingContext,
    groups: Group[],
): string | null {
    const totals = new Map<string, number>();
    for (const row of groups.flatMap((group) => group.packaging)) {
        const key = `${row.productVariantId}:${row.sourceLocationId}`;
        totals.set(key, (totals.get(key) ?? 0) + row.quantity);
    }
    for (const [key, total] of totals) {
        const [productVariantId, locationId] = key.split(':');
        const stock = findStock(context, productVariantId, locationId)!;
        if (total > stock.quantity + QUANTITY_TOLERANCE) {
            return `Stok ${stock.name} di ${stock.locationName} hanya ${formatNumber(stock.quantity)} ${packagingUnitLabel(stock.unit)}.`;
        }
    }
    return null;
}

function duplicateProblem(
    context: KioskPackagingContext,
    group: Group,
): string | null {
    const seen = new Set<string>();
    for (const row of group.packaging) {
        const key = `${row.productVariantId}:${row.sourceLocationId}`;
        if (seen.has(key))
            return `Gabungkan baris ${materialName(context, row.productVariantId)} dari gudang yang sama.`;
        seen.add(key);
    }
    return null;
}

/** First reason the step cannot continue, phrased for the operator; null when ready. */
export function packagingStepProblem(
    context: KioskPackagingContext,
    groups: Group[],
    baseQty: number,
    unit: string,
): string | null {
    if (baseQty <= 0) return null;
    if (groups.length === 0) return 'Pilih merek hasil.';
    if (groups.length > 1) {
        const total = groups.reduce((sum, group) => sum + group.quantity, 0);
        if (
            groups.some((group) => !(group.quantity > 0)) ||
            Math.abs(total - baseQty) > QUANTITY_TOLERANCE
        ) {
            return `Jumlah per merek harus pas ${formatNumber(baseQty)} ${unit}.`;
        }
    }
    const emptyGroup = groups.find((group) => group.packaging.length === 0);
    if (emptyGroup) {
        return `Catat minimal satu kemasan untuk ${brandById(context, emptyGroup.productVariantId)?.name ?? 'merek ini'}.`;
    }
    const rows = groups.flatMap((group) => group.packaging);
    const firstRowProblem = rows
        .map((row) => rowProblem(context, row))
        .find(Boolean);
    if (firstRowProblem) return firstRowProblem;
    const duplicate = groups
        .map((group) => duplicateProblem(context, group))
        .find(Boolean);
    if (duplicate) return duplicate;
    const stock = stockProblem(context, groups);
    if (stock) return stock;
    for (const group of groups) {
        const brand = brandById(context, group.productVariantId);
        if (
            brand?.labelVariantId &&
            !group.packaging.some(
                (row) => row.productVariantId === brand.labelVariantId,
            )
        ) {
            return `${brand.labelName ?? 'Etiket'} wajib dicatat untuk ${brand.name}.`;
        }
    }
    const recorded = new Set(rows.map((row) => row.productVariantId));
    const missingPlanned = context.plannedPackagingIds.find(
        (id) => !recorded.has(id),
    );
    if (missingPlanned)
        return `Catat juga ${materialName(context, missingPlanned)} yang ada di rencana SPK.`;
    return null;
}

export interface UsageNeed extends KioskPackagingUsage {
    stockTotal: number;
    /** Average use per base unit of output on this SPK; null before any output. */
    perUnit: number | null;
    need: number | null;
    sufficient: boolean | null;
}

/** Stock warning only: projects the remaining need from this SPK's own average. */
export function estimateUsageNeeds(
    context: KioskPackagingContext,
    remainingBaseQty: number,
): UsageNeed[] {
    return context.usage.map((row) => {
        const stockTotal = context.stock
            .filter((stock) => stock.productVariantId === row.productVariantId)
            .reduce((sum, stock) => sum + stock.quantity, 0);
        if (context.producedBaseQty <= 0) {
            return {
                ...row,
                stockTotal,
                perUnit: null,
                need: null,
                sufficient: null,
            };
        }
        const perUnit = roundEstimate(row.quantity / context.producedBaseQty);
        const need = roundEstimate(perUnit * Math.max(remainingBaseQty, 0));
        return {
            ...row,
            stockTotal,
            perUnit,
            need,
            sufficient: stockTotal >= need,
        };
    });
}
