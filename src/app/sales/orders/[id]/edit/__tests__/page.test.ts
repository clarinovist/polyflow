import { describe, it, expect, vi } from 'vitest';

// The page module (Server Component) pulls in actions/services that
// ultimately touch prisma and a large client form component. We only test
// the pure exported helper `mapSalesOrderItemForEdit`, so mock out
// everything else the module imports.
vi.mock('@/actions/sales/sales', () => ({
    getSalesOrderById: vi.fn(),
}));
vi.mock('@/actions/sales/customer', () => ({
    getCustomers: vi.fn(),
}));
vi.mock('@/actions/inventory/inventory', () => ({
    getLocations: vi.fn(),
    getProductVariants: vi.fn(),
}));
vi.mock('@/components/sales/SalesOrderForm', () => ({
    SalesOrderForm: () => null,
}));
vi.mock('@/components/ui/card', () => ({
    Card: ({ children }: { children?: unknown }) => children,
    CardContent: ({ children }: { children?: unknown }) => children,
    CardHeader: ({ children }: { children?: unknown }) => children,
    CardTitle: ({ children }: { children?: unknown }) => children,
}));

import { mapSalesOrderItemForEdit } from '../page';

describe('mapSalesOrderItemForEdit', () => {
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
        const result = mapSalesOrderItemForEdit(persistedItem);

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
            discountPercent: 0,
            taxPercent: 11,
            dppOtherAmount: null,
            ppnMode: 'EXCLUDE',
        };

        // Act
        const result = mapSalesOrderItemForEdit(persistedItem);

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
        const result = mapSalesOrderItemForEdit(persistedItem);

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
        const result = mapSalesOrderItemForEdit(persistedItem);

        // Assert
        expect(result.dppOtherAmount).toBe(250);
    });

    it('prefers entered-unit quantity/price over base quantity/price when a sales-unit conversion was used', () => {
        // Arrange
        const persistedItem = {
            id: 'item-5',
            productVariantId: 'variant-5',
            quantity: 100,
            unitPrice: 10,
            enteredQuantity: 10,
            enteredUnit: 'BOX',
            conversionFactorSnapshot: 10,
            enteredUnitPrice: 100,
            ppnMode: 'INCLUDE',
        };

        // Act
        const result = mapSalesOrderItemForEdit(persistedItem);

        // Assert
        expect(result.quantity).toBe(10);
        expect(result.unitPrice).toBe(100);
        expect(result.ppnMode).toBe('INCLUDE');
    });
});
