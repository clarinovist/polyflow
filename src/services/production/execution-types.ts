import { BomItem, Prisma, ProductionMaterial } from '@prisma/client';

export interface BackflushOrder {
    isMaklon: boolean;
    locationId: string;
    bom?: { category: string | null } | null;
}

export type MaterialLike = Pick<ProductionMaterial, 'productVariantId' | 'quantity'> | Pick<BomItem, 'productVariantId' | 'quantity'>;

export interface ProductionExecutionOrder extends BackflushOrder {
    id: string;
    orderNumber: string;
    plannedQuantity: number | Prisma.Decimal;
    bom: {
        productVariantId: string;
        outputQuantity: number | Prisma.Decimal;
        category: string | null;
        items: MaterialLike[];
    };
    plannedMaterials: MaterialLike[];
}