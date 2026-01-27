export const PRODUCT_CONSTANTS = {
    // Relaxes regex to allow:
    // - Uppercase letters
    // - Numbers
    // - Dashes
    // - Minimum 5 characters (to avoid too short codes)
    // - Maximum 20 characters (to fit within typical DB limits)
    SKU_REGEX: /^[A-Z0-9-]{5,20}$/,
    SKU_HELPER_TEXT: "Format: 5-20 characters, uppercase letters, numbers, and dashes (e.g., RM-PP-KARUNG)",

    // Critical Machine Codes (from Seed/UI)
    MACHINES: {
        EXTRUDER_01: 'EXT-01',
        MIXER_01: 'MIX-01',
        PACKER_01: 'PAK-01'
    }
} as const;
