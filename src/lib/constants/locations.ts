export const WAREHOUSE_SLUGS = {
    RAW_MATERIAL: 'rm_warehouse',
    FINISHING: 'fg_warehouse',
    SCRAP: 'scrap_warehouse',
    MIXING: 'mixing_area',
    PACKING_AREA: 'packing_area',
    WIP_STORAGE: 'wip_storage',
    CUSTOMER_OWNED: 'customer_owned_storage'
} as const;

export const MAKLON_STAGE_SLUGS = {
    RAW_MATERIAL: 'maklon_raw_material',
    WIP: 'maklon_wip',
    FINISHED_GOOD: 'maklon_fg',
    PACKING: 'maklon_packing'
} as const;

export type WarehouseSlug = typeof WAREHOUSE_SLUGS[keyof typeof WAREHOUSE_SLUGS];
export type MaklonStageSlug = typeof MAKLON_STAGE_SLUGS[keyof typeof MAKLON_STAGE_SLUGS];
