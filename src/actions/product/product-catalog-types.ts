import type { ProductType, Unit } from '@prisma/client';

export const PRODUCT_CATALOG_DEFAULT_PAGE_SIZE = 50;
export const PRODUCT_CATALOG_MAX_PAGE_SIZE = 100;
export const PRODUCT_CATALOG_SORT_KEYS = [
    'name',
    'stock',
    'currentCost',
    'standardCost',
    'buyPrice',
    'price',
] as const;

export type ProductCatalogSortKey = (typeof PRODUCT_CATALOG_SORT_KEYS)[number];
export type ProductCatalogSortDirection = 'asc' | 'desc';

export type ProductCatalogQuery = {
    search?: string;
    type?: ProductType;
    includeArchived?: boolean;
    page?: number;
    pageSize?: number;
    sort?: ProductCatalogSortKey;
    direction?: ProductCatalogSortDirection;
};

export type NormalizedProductCatalogQuery = {
    search: string;
    type?: ProductType;
    includeArchived: boolean;
    sort: ProductCatalogSortKey;
    direction: ProductCatalogSortDirection;
};

export type ProductCatalogVariant = {
    id: string;
    productId: string;
    productName: string;
    productType: ProductType;
    name: string;
    skuCode: string;
    primaryUnit: Unit;
    salesUnit: Unit | null;
    conversionFactor: number;
    price: number | null;
    standardCost: number | null;
    buyPrice: number | null;
    minStockAlert: number | null;
    currentCost: number;
    currentStockValue: number;
    stock: number;
    archivedAt: string | null;
    inventoryCount: number;
};

export type ProductCatalogPage = {
    items: ProductCatalogVariant[];
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
    query: NormalizedProductCatalogQuery;
};
