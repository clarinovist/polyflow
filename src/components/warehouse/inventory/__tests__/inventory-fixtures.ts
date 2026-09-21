import type { InventoryItem } from '../inventory-table-types';

export const stockItem: InventoryItem = {
    id: 'inv-a', locationId: 'loc-a', productVariantId: 'product-a',
    quantity: 100, reservedQuantity: 100, waitingQuantity: 7, availableQuantity: 0,
    averageCost: 2500, updatedAt: '2026-09-01T00:00:00Z',
    productVariant: {
        id: 'product-a', name: 'Produk sintetis', skuCode: 'SYN-A', primaryUnit: 'KG',
        minStockAlert: 5, price: 4000,
        product: { id: 'parent-a', name: 'Produk sintetis', productType: 'RAW_MATERIAL' },
    },
    location: { id: 'loc-a', name: 'Lokasi A', locationType: 'INTERNAL' },
};
export const stockLocations = [
    { id: 'loc-a', name: 'Lokasi A', totalSkus: 1, lowStockCount: 0 },
    { id: 'loc-b', name: 'Lokasi B', totalSkus: 1, lowStockCount: 0, locationType: 'CUSTOMER_OWNED' },
];
