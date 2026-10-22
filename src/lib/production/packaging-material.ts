import type { ProductType, Unit } from '@prisma/client';

// AUXILIARY is the existing catalog category for labels, sacks and wrapping film.
// Only explicitly selected auxiliaries replace BOM consumption; process additives
// must not be globally excluded from the recipe.
export const PACKAGING_MATERIAL_TYPES: ProductType[] = ['PACKAGING', 'AUXILIARY'];
export const PACKAGING_STOCK_UNITS: Unit[] = ['KG', 'PCS'];

export function isPackagingMaterial(productType: string, primaryUnit: string) {
    return PACKAGING_MATERIAL_TYPES.some((type) => type === productType) &&
        PACKAGING_STOCK_UNITS.some((unit) => unit === primaryUnit);
}

export function packagingUnitLabel(unit: string) {
    return unit === 'PCS' ? 'pcs / lembar' : unit;
}
