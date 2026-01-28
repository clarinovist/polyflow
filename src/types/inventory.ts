import { Prisma, ProductType, Unit } from '@prisma/client';

export type InventoryWithRelations = {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: Prisma.Decimal;
    updatedAt: Date;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: Unit;
        price: Prisma.Decimal | null;
        minStockAlert: Prisma.Decimal | null;
        product: {
            id: string;
            name: string;
            productType: ProductType;
        };
    };
    location: {
        id: string;
        name: string;
    };
    reservedQuantity?: number;
    waitingQuantity?: number;
    availableQuantity?: number;
};