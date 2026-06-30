/**
 * PolyFlow GL Account Mapping Policy
 *
 * Tenant-aware GL account resolution.
 * Uses account-resolver.ts for role-based lookup with fallback patterns.
 * Supports both Kiyowo (5-digit) and Melindo (X-XXX) COA formats.
 */

import type { ProductType } from '@prisma/client';
import { resolveAccount, type AccountRole, type ResolvedAccount } from './account-resolver';

// Re-export for backward compatibility
export type GLAccountKey = string;

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
 * Maps ProductType to AccountRole for inventory accounts.
 */
function productTypeToAccountRole(productType: ProductType | string | null | undefined): AccountRole {
    switch (productType) {
        case 'RAW_MATERIAL':
            return 'raw-material';
        case 'FINISHED_GOOD':
            return 'finished-goods';
        case 'WIP':
        case 'INTERMEDIATE':
            return 'wip';
        case 'SCRAP':
            return 'scrap';
        case 'PACKAGING':
            return 'packaging';
        default:
            return 'inventory';
    }
}

/**
 * Maps AccountMappingContext to AccountRole.
 */
function contextToAccountRole(context: AccountMappingContext): AccountRole {
    switch (context) {
        case 'inventory':
            return 'inventory';
        case 'trade-payable':
            return 'accounts-payable';
        case 'cogs':
            return 'cogs';
        case 'wip':
            return 'wip';
        case 'adjustment-gain':
            return 'adjustment-gain';
        case 'adjustment-loss':
            return 'adjustment-loss';
        case 'manufacturing-overhead':
            return 'manufacturing-overhead';
        case 'accrued-liabilities':
            return 'accrued-liabilities';
    }
}

/**
 * Resolve the inventory asset account code based on product type.
 * Uses tenant-aware account resolver with fallback patterns.
 */
export async function resolveInventoryAccountCode(
    productType: ProductType | string | null | undefined,
    tenantId?: string,
): Promise<ResolvedAccount> {
    const role = productTypeToAccountRole(productType);
    return resolveAccount(role, tenantId);
}

/**
 * Resolve standard GL account codes for inventory auto-journal contexts.
 * Uses tenant-aware account resolver with fallback patterns.
 */
export async function resolveAccountCode(
    productType: ProductType | string | null | undefined,
    movementContext: AccountMappingContext,
    tenantId?: string,
): Promise<ResolvedAccount> {
    if (movementContext === 'inventory') {
        return resolveInventoryAccountCode(productType, tenantId);
    }
    const role = contextToAccountRole(movementContext);
    return resolveAccount(role, tenantId);
}

/**
 * @deprecated Use resolveInventoryAccountCode() instead for tenant-aware resolution.
 * This synchronous version only returns codes and may not work with Melindo COA format.
 */
export const GL_ACCOUNT_CODES = {
    INVENTORY_DEFAULT: '11300',
    INVENTORY_RAW_MATERIAL: '11310',
    INVENTORY_WIP: '11320',
    INVENTORY_FINISHED_GOOD: '11330',
    INVENTORY_PACKAGING: '11340',
    INVENTORY_SCRAP: '11350',
    TRADE_PAYABLE: '21110',
    ACCRUED_LIABILITIES: '21200',
    COGS_DEFAULT: '50000',
    MANUFACTURING_OVERHEAD: '51100',
    ADJUSTMENT_GAIN: '81100',
    ADJUSTMENT_LOSS: '91100',
} as const;

// Backward-compatible alias for existing call sites/tests.
export const getInventoryAccount = resolveInventoryAccountCode;
