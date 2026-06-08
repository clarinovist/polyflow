import { BomItem, Prisma, ProductType, ProductionMaterial, Unit } from '@prisma/client';

export interface BackflushOrder {
    isMaklon: boolean;
    locationId: string;
    bom?: { category: string | null } | null;
}

export type MaterialLike = (
    Pick<ProductionMaterial, 'productVariantId' | 'quantity'> |
    Pick<BomItem, 'productVariantId' | 'quantity'>
) & {
    productVariant?: {
        name?: string | null;
        skuCode?: string | null;
        primaryUnit?: Unit | null;
        attributes?: Prisma.JsonValue | null;
        product?: {
            productType?: ProductType | null;
        } | null;
    } | null;
};

export interface OutputBackflushContext {
    enteredQuantity: number | null;
    enteredUnit: Unit | null;
    baseQuantity: number;
}

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
