export const WAREHOUSE_SLUGS = {
    RAW_MATERIAL: 'rm_warehouse',
    FINISHING: 'fg_warehouse',
    SCRAP: 'scrap_warehouse',
    MIXING: 'mixing_area'
} as const;

export type WarehouseSlug = typeof WAREHOUSE_SLUGS[keyof typeof WAREHOUSE_SLUGS];
