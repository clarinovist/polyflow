/**
 * PolyFlow GL Account Mapping Policy
 *
 * Centralized, code-based GL account configuration policy.
 * Resolves standard account codes for inventory, costing, and maklon transactions.
 */

import type { ProductType } from '@prisma/client';

export const GL_ACCOUNT_CODES = {
    // Inventory Asset Accounts
    INVENTORY_DEFAULT: '11300',
    INVENTORY_RAW_MATERIAL: '11310',
    INVENTORY_WIP: '11320',
    INVENTORY_FINISHED_GOOD: '11330',
    INVENTORY_PACKAGING: '11340',
    INVENTORY_SCRAP: '11350',

    // Trade & AP Accounts
    TRADE_PAYABLE: '21110',
    ACCRUED_LIABILITIES: '21200',

    // Cost & Expense Accounts
    COGS_DEFAULT: '50000',
    MANUFACTURING_OVERHEAD: '51100',

    // Adjustment Gain/Loss
    ADJUSTMENT_GAIN: '81100',
    ADJUSTMENT_LOSS: '91100',
} as const;

export type GLAccountKey = keyof typeof GL_ACCOUNT_CODES;

export type AccountMappingContext =
    | 'inventory'
    | 'trade-payable'
    | 'cogs'
    | 'wip'
    | 'adjustment-gain'
    | 'adjustment-loss'
    | 'manufacturing-overhead'
    | 'accrued-liabilities';

/**
 * Resolves the inventory asset account code based on product type.
 */
export function resolveInventoryAccountCode(productType: ProductType | string | null | undefined): string {
    switch (productType) {
        case 'RAW_MATERIAL':
            return GL_ACCOUNT_CODES.INVENTORY_RAW_MATERIAL;
        case 'FINISHED_GOOD':
            return GL_ACCOUNT_CODES.INVENTORY_FINISHED_GOOD;
        case 'WIP':
        case 'INTERMEDIATE':
            return GL_ACCOUNT_CODES.INVENTORY_WIP;
        case 'SCRAP':
            return GL_ACCOUNT_CODES.INVENTORY_SCRAP;
        case 'PACKAGING':
            return GL_ACCOUNT_CODES.INVENTORY_PACKAGING;
        default:
            return GL_ACCOUNT_CODES.INVENTORY_DEFAULT;
    }
}

/**
 * Resolves standard GL account codes for inventory auto-journal contexts.
 *
 * This is intentionally code-based for the first hardening batch. It creates a
 * single seam that can later be backed by tenant/DB configuration without
 * changing posting call sites.
 */
export function resolveAccountCode(
    productType: ProductType | string | null | undefined,
    movementContext: AccountMappingContext
): string {
    switch (movementContext) {
        case 'inventory':
            return resolveInventoryAccountCode(productType);
        case 'trade-payable':
            return GL_ACCOUNT_CODES.TRADE_PAYABLE;
        case 'cogs':
            return GL_ACCOUNT_CODES.COGS_DEFAULT;
        case 'wip':
            return GL_ACCOUNT_CODES.INVENTORY_WIP;
        case 'adjustment-gain':
            return GL_ACCOUNT_CODES.ADJUSTMENT_GAIN;
        case 'adjustment-loss':
            return GL_ACCOUNT_CODES.ADJUSTMENT_LOSS;
        case 'manufacturing-overhead':
            return GL_ACCOUNT_CODES.MANUFACTURING_OVERHEAD;
        case 'accrued-liabilities':
            return GL_ACCOUNT_CODES.ACCRUED_LIABILITIES;
    }
}

// Backward-compatible alias for existing call sites/tests.
export const getInventoryAccount = resolveInventoryAccountCode;
