'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    Inventory,
    CostHistory,
    ProductVariant,
    ProductType,
    Unit,
    Prisma,
} from '@prisma/client';
import { serializeData } from '@/lib/utils/utils';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';
import {
    getCurrentUnitCost,
    getVariantCostDiagnostics,
    type VariantCostDiagnostics,
} from '@/lib/utils/current-cost';
import {
    PRODUCT_CATALOG_DEFAULT_PAGE_SIZE,
    PRODUCT_CATALOG_MAX_PAGE_SIZE,
    PRODUCT_CATALOG_SORT_KEYS,
    type NormalizedProductCatalogQuery,
    type ProductCatalogPage,
    type ProductCatalogQuery,
    type ProductCatalogSortKey,
    type ProductCatalogVariant,
} from './product-catalog-types';

type InventoryWithLocation = Inventory & {
    location: { name: string };
};

type CostDiagnosticsSnapshot = VariantCostDiagnostics & {
    inventoryCount: number;
};

type CostHistoryWithCreatedBy = CostHistory & {
    createdBy: { name: string };
};

type ProductVariantWithRelations = ProductVariant & {
    inventories: InventoryWithLocation[];
    costHistory: CostHistoryWithCreatedBy[];
};

function buildCostDiagnosticsSnapshot(
    variant: {
        inventories?: Array<{ quantity?: unknown; averageCost?: unknown }>;
    } & Record<string, unknown>,
): CostDiagnosticsSnapshot {
    const diagnostics = getVariantCostDiagnostics(variant);

    return {
        ...diagnostics,
        inventoryCount: (variant.inventories || []).length,
    };
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(1, Math.floor(value as number));
}

function normalizeCatalogQuery(options?: ProductCatalogQuery) {
    const requestedPage = normalizePositiveInteger(options?.page, 1);
    const requestedPageSize = normalizePositiveInteger(
        options?.pageSize,
        PRODUCT_CATALOG_DEFAULT_PAGE_SIZE,
    );
    const sort = PRODUCT_CATALOG_SORT_KEYS.includes(
        options?.sort as ProductCatalogSortKey,
    )
        ? (options?.sort as ProductCatalogSortKey)
        : 'name';

    return {
        requestedPage,
        pageSize: Math.min(requestedPageSize, PRODUCT_CATALOG_MAX_PAGE_SIZE),
        query: {
            search: options?.search?.trim().slice(0, 100) ?? '',
            type: options?.type,
            includeArchived: options?.includeArchived === true,
            sort,
            direction: options?.direction === 'desc' ? 'desc' : 'asc',
        } satisfies NormalizedProductCatalogQuery,
    };
}

function buildCatalogWhere(
    query: NormalizedProductCatalogQuery,
): Prisma.ProductVariantWhereInput {
    return {
        ...(query.includeArchived ? {} : { archivedAt: null }),
        ...(query.type ? { product: { productType: query.type } } : {}),
        ...(query.search
            ? {
                  OR: [
                      {
                          skuCode: {
                              contains: query.search,
                              mode: Prisma.QueryMode.insensitive,
                          },
                      },
                      {
                          name: {
                              contains: query.search,
                              mode: Prisma.QueryMode.insensitive,
                          },
                      },
                      {
                          product: {
                              name: {
                                  contains: query.search,
                                  mode: Prisma.QueryMode.insensitive,
                              },
                          },
                      },
                  ],
              }
            : {}),
    };
}

const catalogInclude = {
    product: { select: { name: true, productType: true } },
    inventories: { select: { quantity: true, averageCost: true } },
    _count: { select: { inventories: true } },
} satisfies Prisma.ProductVariantInclude;

type CatalogRecord = Prisma.ProductVariantGetPayload<{
    include: typeof catalogInclude;
}>;

function mapCatalogVariant(variant: CatalogRecord): ProductCatalogVariant {
    const stock = variant.inventories.reduce(
        (sum, inventory) => sum.plus(inventory.quantity),
        new Prisma.Decimal(0),
    );
    const stockValue = variant.inventories.reduce(
        (sum, inventory) =>
            sum.plus(
                inventory.quantity.times(
                    inventory.averageCost ?? new Prisma.Decimal(0),
                ),
            ),
        new Prisma.Decimal(0),
    );

    return {
        id: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        productType: variant.product.productType,
        name: variant.name,
        skuCode: variant.skuCode,
        primaryUnit: variant.primaryUnit,
        salesUnit: variant.salesUnit,
        conversionFactor: Number(variant.conversionFactor),
        price: variant.price === null ? null : Number(variant.price),
        standardCost:
            variant.standardCost === null ? null : Number(variant.standardCost),
        buyPrice: variant.buyPrice === null ? null : Number(variant.buyPrice),
        minStockAlert:
            variant.minStockAlert === null ? null : Number(variant.minStockAlert),
        currentCost: getCurrentUnitCost(variant),
        currentStockValue: stock.gt(0) ? stockValue.toNumber() : 0,
        stock: stock.toNumber(),
        archivedAt: variant.archivedAt?.toISOString() ?? null,
        inventoryCount: variant._count.inventories,
    };
}

function getCatalogOrderBy(
    sort: ProductCatalogSortKey,
    direction: Prisma.SortOrder,
): Prisma.ProductVariantOrderByWithRelationInput[] {
    const stableOrder = [{ skuCode: 'asc' as const }, { id: 'asc' as const }];

    switch (sort) {
        case 'standardCost':
            return [{ standardCost: direction }, ...stableOrder];
        case 'buyPrice':
            return [{ buyPrice: direction }, ...stableOrder];
        case 'price':
            return [{ price: direction }, ...stableOrder];
        default:
            return [{ name: direction }, ...stableOrder];
    }
}

async function getComputedSortPageIds(
    query: NormalizedProductCatalogQuery,
    offset: number,
    pageSize: number,
) {
    const conditions: Prisma.Sql[] = [];

    if (!query.includeArchived) {
        conditions.push(Prisma.sql`pv."archivedAt" IS NULL`);
    }
    if (query.type) {
        conditions.push(Prisma.sql`p."productType" = ${query.type}::"ProductType"`);
    }
    if (query.search) {
        // Prisma `contains` treats SQL wildcard characters literally. Escape the
        // raw-query pattern identically so count and computed-sort pages match.
        const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
        conditions.push(
            Prisma.sql`(
                pv."skuCode" ILIKE ${search} ESCAPE E'\\\\'
                OR pv.name ILIKE ${search} ESCAPE E'\\\\'
                OR p.name ILIKE ${search} ESCAPE E'\\\\'
            )`,
        );
    }

    const whereSql = conditions.length
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;
    const stockSql = Prisma.sql`COALESCE(SUM(i.quantity), 0)`;
    const stockValueSql = Prisma.sql`COALESCE(SUM(i.quantity * COALESCE(i."averageCost", 0)), 0)`;
    const currentCostSql = Prisma.sql`CASE
        WHEN ${stockSql} > 0 AND ${stockValueSql} > 0
            THEN ${stockValueSql} / ${stockSql}
        WHEN COALESCE(pv."standardCost", 0) > 0 THEN pv."standardCost"
        WHEN COALESCE(pv."buyPrice", 0) > 0 THEN pv."buyPrice"
        WHEN COALESCE(pv.price, 0) > 0 THEN pv.price
        ELSE 0::numeric
    END`;
    const sortSql = query.sort === 'stock' ? stockSql : currentCostSql;
    const directionSql =
        query.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT pv.id
        FROM "ProductVariant" AS pv
        INNER JOIN "Product" AS p ON p.id = pv."productId"
        LEFT JOIN "Inventory" AS i ON i."productVariantId" = pv.id
        ${whereSql}
        GROUP BY pv.id
        ORDER BY ${sortSql} ${directionSql}, pv."skuCode" ASC, pv.id ASC
        OFFSET ${offset}
        LIMIT ${pageSize}
    `);
}

export const getProductCatalogPage = withTenant(
    async function getProductCatalogPage(options?: ProductCatalogQuery) {
        return safeAction(async (): Promise<ProductCatalogPage> => {
            await requireAuth();
            const { requestedPage, pageSize, query } =
                normalizeCatalogQuery(options);
            const where = buildCatalogWhere(query);
            const total = await prisma.productVariant.count({ where });
            const pageCount = Math.ceil(total / pageSize);
            const page = pageCount === 0 ? 1 : Math.min(requestedPage, pageCount);
            const offset = (page - 1) * pageSize;
            const computedSort =
                query.sort === 'stock' || query.sort === 'currentCost';

            if (computedSort) {
                const pageIds = await getComputedSortPageIds(
                    query,
                    offset,
                    pageSize,
                );
                const ids = pageIds.map(({ id }) => id);
                const records = ids.length
                    ? await prisma.productVariant.findMany({
                          where: { id: { in: ids } },
                          include: catalogInclude,
                      })
                    : [];
                const recordsById = new Map(
                    records.map((record) => [record.id, record]),
                );
                const items = ids.flatMap((id) => {
                    const record = recordsById.get(id);
                    return record ? [mapCatalogVariant(record)] : [];
                });

                return { items, page, pageSize, total, pageCount, query };
            }

            const records = await prisma.productVariant.findMany({
                where,
                include: catalogInclude,
                orderBy: getCatalogOrderBy(query.sort, query.direction),
                skip: offset,
                take: pageSize,
            });
            const items = records.map(mapCatalogVariant);

            return { items, page, pageSize, total, pageCount, query };
        });
    },
);

export const getProducts = withTenant(async function getProducts(options?: {
    type?: ProductType;
    includeArchived?: boolean;
}) {
    return safeAction(async () => {
        await requireAuth();
        const where: Prisma.ProductWhereInput = {};

        if (options?.type) {
            where.productType = options.type;
        }

        const includeArchived = options?.includeArchived ?? false;
        const variantWhere: Prisma.ProductVariantWhereInput = includeArchived
            ? {}
            : { archivedAt: null };

        // Sembunyikan produk yang seluruh variannya terarsip (kecuali diminta).
        if (!includeArchived) {
            where.variants = { some: { archivedAt: null } };
        }

        const products = await prisma.product.findMany({
            where,
            include: {
                variants: {
                    where: variantWhere,
                    include: {
                        _count: {
                            select: {
                                inventories: true,
                            },
                        },
                        inventories: {
                            select: {
                                quantity: true,
                                averageCost: true,
                            },
                        },
                    },
                    orderBy: {
                        name: 'asc',
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
        });

        return products.map((product) => {
            let productTotalStock = 0;

            const variantsArray = product.variants || [];

            const cleanedVariants = variantsArray.map((variant) => {
                const invs = variant.inventories || [];
                const variantStock = invs.reduce((vSum, inv) => {
                    return (
                        vSum +
                        (inv.quantity?.toNumber
                            ? inv.quantity.toNumber()
                            : Number(inv.quantity || 0))
                    );
                }, 0);
                const variantStockValue = invs.reduce((vSum, inv) => {
                    const quantity = inv.quantity?.toNumber
                        ? inv.quantity.toNumber()
                        : Number(inv.quantity || 0);
                    const averageCost = inv.averageCost?.toNumber
                        ? inv.averageCost.toNumber()
                        : Number(inv.averageCost || 0);
                    return vSum + quantity * averageCost;
                }, 0);
                const currentCost = getCurrentUnitCost(variant);

                productTotalStock += variantStock;

                const { inventories: _, ...variantData } = variant;

                return {
                    ...variantData,
                    stock: variantStock,
                    currentCost,
                    currentStockValue: variantStock > 0 ? variantStockValue : 0,
                };
            });

            return {
                ...product,
                variants: cleanedVariants,
                totalStock: productTotalStock,
            };
        });
    });
});

export const getProductById = withTenant(async function getProductById(
    id: string,
) {
    return safeAction(async () => {
        await requireAuth();
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                variants: {
                    include: {
                        inventories: {
                            select: {
                                quantity: true,
                                averageCost: true,
                                location: {
                                    select: { name: true },
                                },
                            },
                        },
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore - costHistory is not directly on ProductVariant type, but we are including it.
                        costHistory: {
                            take: 10,
                            orderBy: { createdAt: 'desc' },
                            include: {
                                createdBy: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                    orderBy: {
                        name: 'asc',
                    },
                },
            },
        });

        if (!product) {
            return null;
        }

        const enrichedVariants = (
            product.variants || ([] as ProductVariantWithRelations[])
        ).map((variant) => {
            const invs = variant.inventories || [];
            const stock = invs.reduce(
                (sum: number, inv) => sum + Number(inv.quantity),
                0,
            );
            const stockValue = invs.reduce(
                (sum: number, inv) =>
                    sum + Number(inv.quantity) * Number(inv.averageCost || 0),
                0,
            );
            const costDiagnostics = buildCostDiagnosticsSnapshot(variant);
            return {
                ...variant,
                stock,
                currentCost: getCurrentUnitCost(variant),
                currentStockValue: stock > 0 ? stockValue : 0,
                costDiagnostics,
            };
        });

        return serializeData({
            ...product,
            variants: enrichedVariants,
        });
    });
});

export const getUnits = withTenant(async function getUnits(): Promise<{
    success: boolean;
    data?: Unit[];
    error?: string;
}> {
    return safeAction(async () => {
        await requireAuth();
        return Object.values(Unit);
    });
});

export const getProductTypes = withTenant(
    async function getProductTypes(): Promise<{
        success: boolean;
        data?: ProductType[];
        error?: string;
    }> {
        return safeAction(async () => {
            await requireAuth();
            return Object.values(ProductType);
        });
    },
);

export const getVariants = withTenant(async function getVariants() {
    return safeAction(async () => {
        await requireAuth();
        const variants = await prisma.productVariant.findMany({
            where: { archivedAt: null },
            include: {
                product: true,
            },
            orderBy: {
                skuCode: 'asc',
            },
        });
        return serializeData(variants);
    });
});

export const getNextSKU = withTenant(async function getNextSKU(
    productType: ProductType,
    productName: string,
    currentSkus: string[] = [],
): Promise<{ success: boolean; data?: string; error?: string }> {
    return safeAction(async () => {
        await requireAuth();
        const prefixes: Record<string, string> = {
            [ProductType.RAW_MATERIAL]: 'RM',
            [ProductType.INTERMEDIATE]: 'IN',
            [ProductType.PACKAGING]: 'PK',
            [ProductType.WIP]: 'WP',
            [ProductType.FINISHED_GOOD]: 'FG',
            [ProductType.SCRAP]: 'SC',
        };

        const prefix = prefixes[productType] || 'XX';

        const namePart = productName.replace(/[^A-Z]/gi, '').toUpperCase();

        let category = namePart.substring(0, 3);
        while (category.length < 3) {
            category += 'X';
        }

        const skuPrefix = `${prefix}${category}`;

        const existingVariants = await prisma.productVariant.findMany({
            where: {
                skuCode: {
                    startsWith: skuPrefix,
                },
            },
            select: {
                skuCode: true,
            },
            orderBy: {
                skuCode: 'desc',
            },
        });

        const sequences = new Set<number>();

        for (const variant of existingVariants) {
            const seqPart = variant.skuCode.substring(5);
            const seq = parseInt(seqPart, 10);
            if (!isNaN(seq)) {
                sequences.add(seq);
            }
        }

        for (const sku of currentSkus) {
            if (sku && sku.startsWith(skuPrefix)) {
                const seqPart = sku.substring(5);
                const seq = parseInt(seqPart, 10);
                if (!isNaN(seq)) {
                    sequences.add(seq);
                }
            }
        }

        let nextSeq = 1;
        if (sequences.size > 0) {
            nextSeq = Math.max(...Array.from(sequences)) + 1;
        }

        return `${skuPrefix}${nextSeq.toString().padStart(3, '0')}`;
    });
});
