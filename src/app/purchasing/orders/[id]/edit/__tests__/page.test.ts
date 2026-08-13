import { describe, it, expect, vi } from 'vitest';

// The page module (Server Component) pulls in actions/services that
// ultimately touch prisma and a large client form component. We only test
// the pure exported helper `mapPurchaseOrderItemForEdit`, so mock out
// everything else the module imports.
vi.mock('@/actions/purchasing/purchasing', () => ({
    getPurchaseOrderById: vi.fn(),
}));
vi.mock('@/actions/purchasing/supplier', () => ({
    getSuppliers: vi.fn(),
}));
vi.mock('@/actions/inventory/inventory', () => ({
    getProductVariants: vi.fn(),
}));
vi.mock('@/components/purchasing/orders/PurchaseOrderForm', () => ({
    PurchaseOrderForm: () => null,
}));

import { mapPurchaseOrderItemForEdit } from '../page';

describe('mapPurchaseOrderItemForEdit', () => {
    it('preserves ppnMode INCLUDE from the persisted item (regression: edit page silently reset it to EXCLUDE)', () => {
        // Arrange
        const persistedItem = {
            id: 'item-1',
            productVariantId: 'variant-1',
            quantity: 10,
            unitPrice: 1000,
            discountPercent: 0,
            taxPercent: 11,
            dppOtherAmount: null,
            ppnMode: 'INCLUDE',
        };

        // Act
        const result = mapPurchaseOrderItemForEdit(persistedItem);

        // Assert
        expect(result.ppnMode).toBe('INCLUDE');
    });

    it('preserves ppnMode EXCLUDE from the persisted item', () => {
        // Arrange
        const persistedItem = {
            id: 'item-2',
            productVariantId: 'variant-2',
            quantity: 5,
            unitPrice: 2000,
            ppnMode: 'EXCLUDE',
        };

        // Act
        const result = mapPurchaseOrderItemForEdit(persistedItem);

        // Assert
        expect(result.ppnMode).toBe('EXCLUDE');
    });

    it('falls back to EXCLUDE when ppnMode is missing from the persisted item', () => {
        // Arrange
        const persistedItem = {
            id: 'item-3',
            productVariantId: 'variant-3',
            quantity: 1,
            unitPrice: 500,
        };

        // Act
        const result = mapPurchaseOrderItemForEdit(persistedItem);

        // Assert
        expect(result.ppnMode).toBe('EXCLUDE');
    });

    it('preserves dppOtherAmount from the persisted item', () => {
        // Arrange
        const persistedItem = {
            id: 'item-4',
            productVariantId: 'variant-4',
            quantity: 1,
            unitPrice: 500,
            dppOtherAmount: 250,
        };

        // Act
        const result = mapPurchaseOrderItemForEdit(persistedItem);

        // Assert
        expect(result.dppOtherAmount).toBe(250);
    });
});
