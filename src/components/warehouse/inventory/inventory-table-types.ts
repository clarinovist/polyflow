import type React from 'react';

export type SortField = 'name' | 'sku' | 'location' | 'stock' | 'type' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface InventoryItem {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: number;
    averageCost?: number | null;
    updatedAt: string | Date;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
        minStockAlert: number | null;
        price: number | null;
        product: {
            id: string;
            name: string;
            productType: string;
        };
    };
    location: {
        id: string;
        name: string;
        locationType?: 'INTERNAL' | 'CUSTOMER_OWNED';
    };
    reservedQuantity?: number;
    waitingQuantity?: number;
    availableQuantity?: number;
}

export interface InventoryTableProps {
    inventory: InventoryItem[];
    variantTotals: Record<string, number>;
    comparisonData?: Record<string, number>;
    showComparison?: boolean;
    initialDate?: string;
    initialCompareDate?: string;
    showPrices?: boolean;
    abcMap?: Record<string, string>;
    topBadges?: React.ReactNode;
    totalStock?: number;
    totalValue?: number;
}
