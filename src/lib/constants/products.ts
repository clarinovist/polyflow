import type { ProductType } from '@prisma/client';

/**
 * Product types that may be consumed as production input.
 *
 * Covers every material a SPK can legitimately draw on:
 * - RAW_MATERIAL / PACKAGING — canonical inputs
 * - AUXILIARY — on tenants that use Indonesian slugs, packaging supplies
 *   (etiket, karung, karton) live here rather than under PACKAGING
 * - INTERMEDIATE / WIP — half-finished batches re-consumed when a mix needs
 *   correcting, so planning never has to edit the BOM to fix one batch
 *
 * FINISHED_GOOD is deliberately excluded: BOM-planned lines already carry it,
 * and adding 358 variants to the ad-hoc pickers makes them unusable.
 */
export const ISSUABLE_MATERIAL_TYPES: readonly ProductType[] = [
    'RAW_MATERIAL',
    'PACKAGING',
    'AUXILIARY',
    'INTERMEDIATE',
    'WIP',
] as const;

export const PRODUCT_CONSTANTS = {
    // Relaxes regex to allow:
    // - Uppercase letters
    // - Numbers
    // - Dashes
    // - Minimum 5 characters (to avoid too short codes)
    // - Maximum 20 characters (to fit within typical DB limits)
    SKU_REGEX: /^[A-Z0-9-]{5,20}$/,
    SKU_HELPER_TEXT:
        'Format: 5-20 characters, uppercase letters, numbers, and dashes (e.g., RM-PP-KARUNG)',

    // Critical Machine Codes (from Seed/UI)
    MACHINES: {
        EXTRUDER_01: 'EXT-01',
        MIXER_01: 'MIX-01',
        PACKER_01: 'PAK-01',
    },
} as const;
