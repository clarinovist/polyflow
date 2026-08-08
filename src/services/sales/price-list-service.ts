'use strict';

import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, ValidationError } from '@/lib/errors/errors';
import { Prisma, ProductType } from '@prisma/client';
import {
    resolveBasePrice,
    priceDeviationPercent,
} from '@/lib/utils/price-format';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export type ListPricesParams = {
    customerId?: string;
    productVariantId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    /** null = no isActive filter (all), true/false = filter. Default true if undefined (spec). */
    isActive?: boolean | null;
    /** Filter by product.productType */
    category?: ProductType;
};

export type ListedPrice = {
    id: string;
    customerId: string;
    productVariantId: string;
    unitPrice: number;
    isActive: boolean;
    notes: string | null;
    customer: { id: string; name: string; code: string | null };
    productVariant: {
        id: string;
        skuCode: string;
        name: string;
        product: { id: string; name: string; productType: ProductType };
    };
    createdAt: Date;
    updatedAt: Date;
};

export type ListPricesResult = {
    data: ListedPrice[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export type BulkUpsertEntry = {
    customerId: string;
    productVariantId: string;
    price: number;
    notes?: string | null;
    isActive?: boolean;
    /** For audit compatibility - not stored on model currently, accepted optionally. */
    updatedById?: string;
};

export type BulkAdjustFilter = {
    customerId?: string;
    productVariantId?: string;
    category?: ProductType;
    /** If true/null, adjust only active price rows. Default true. */
    isActive?: boolean | null;
};

export type BulkAdjustMode = 'PERCENT' | 'AMOUNT';

export type BulkAdjustInput = {
    filter: BulkAdjustFilter;
    mode: BulkAdjustMode;
    value: number;
    dryRun: boolean;
};

export type BulkAdjustPreviewRow = {
    id: string;
    customerId: string;
    productVariantId: string;
    oldPrice: number;
    newPrice: number;
    customerName: string;
    productName: string;
    skuCode: string;
};

export type BulkAdjustPreviewResult = {
    preview: BulkAdjustPreviewRow[];
    affectedCount: number;
    totalFiltered: number;
};

export type BulkAdjustApplyResult = {
    updatedCount: number;
    preview: BulkAdjustPreviewRow[];
};

function clampPageSize(input?: number): number {
    if (!input || !Number.isFinite(input) || input <= 0)
        return DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(1, Math.floor(input)), MAX_PAGE_SIZE);
}

function normalizePage(input?: number): number {
    if (!input || !Number.isFinite(input) || input <= 0) return 1;
    return Math.floor(input);
}

function buildSearchWhere(search?: string) {
    if (!search?.trim()) return undefined;
    const q = search.trim();
    return {
        OR: [
            {
                customer: {
                    name: { contains: q, mode: 'insensitive' as const },
                },
            },
            {
                customer: {
                    code: { contains: q, mode: 'insensitive' as const },
                },
            },
            {
                productVariant: {
                    name: { contains: q, mode: 'insensitive' as const },
                },
            },
            {
                productVariant: {
                    skuCode: { contains: q, mode: 'insensitive' as const },
                },
            },
            {
                productVariant: {
                    product: {
                        name: { contains: q, mode: 'insensitive' as const },
                    },
                },
            },
        ],
    };
}

/**
 * List customer-product prices with pagination.
 * isActive default true unless explicitly passed as boolean or null.
 * Pagination always enforced: default 50, max 200.
 */
export async function listPrices(
    params: ListPricesParams = {},
): Promise<ListPricesResult> {
    const page = normalizePage(params.page);
    const pageSize = clampPageSize(params.pageSize);
    const skip = (page - 1) * pageSize;

    const isActiveFilter =
        params.isActive === null ? undefined : (params.isActive ?? true);

    const where: Prisma.CustomerProductPriceWhereInput = {};

    if (params.customerId) where.customerId = params.customerId;
    if (params.productVariantId)
        where.productVariantId = params.productVariantId;
    if (isActiveFilter !== undefined) where.isActive = isActiveFilter;
    if (params.category) {
        where.productVariant = {
            ...(where.productVariant as object | undefined),
            product: { productType: params.category },
        } as Prisma.ProductVariantWhereInput;
    }

    const searchWhere = buildSearchWhere(params.search);
    const combinedWhere: Prisma.CustomerProductPriceWhereInput = searchWhere
        ? { AND: [where, searchWhere] }
        : where;

    const [total, rows] = await Promise.all([
        prisma.customerProductPrice.count({ where: combinedWhere }),
        prisma.customerProductPrice.findMany({
            where: combinedWhere,
            include: {
                customer: { select: { id: true, name: true, code: true } },
                productVariant: {
                    select: {
                        id: true,
                        skuCode: true,
                        name: true,
                        product: {
                            select: { id: true, name: true, productType: true },
                        },
                    },
                },
            },
            orderBy: [
                { customer: { name: 'asc' } },
                { productVariant: { product: { name: 'asc' } } },
                { productVariant: { name: 'asc' } },
            ],
            skip,
            take: pageSize,
        }),
    ]);

    const data: ListedPrice[] = rows.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        productVariantId: r.productVariantId,
        unitPrice: Number(r.unitPrice),
        isActive: r.isActive,
        notes: r.notes,
        customer: r.customer,
        productVariant: {
            id: r.productVariant.id,
            skuCode: r.productVariant.skuCode,
            name: r.productVariant.name,
            product: r.productVariant
                .product as ListedPrice['productVariant']['product'],
        },
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    }));

    return {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}

/**
 * Bulk upsert prices.
 * Behavior: ALL-OR-NOTHING transaction. 1 entry fails -> entire tx rollback.
 * Documented edge: duplicate [customerId, productVariantId] in input -> last wins (deduped).
 * Uses unique constraint customerId_productVariantId already defined in schema.
 */
export async function bulkUpsertPrices(
    entries: BulkUpsertEntry[],
): Promise<{ count: number }> {
    if (!entries || entries.length === 0) {
        throw new ValidationError('Daftar harga kosong');
    }

    // Dedup by composite key, last wins
    const dedupedMap = new Map<string, BulkUpsertEntry>();
    for (const e of entries) {
        if (!e.customerId || !e.productVariantId) {
            throw new ValidationError('customerId dan productVariantId wajib');
        }
        if (!Number.isFinite(e.price) || e.price < 0) {
            throw new ValidationError('Harga tidak boleh negatif');
        }
        const key = `${e.customerId}::${e.productVariantId}`;
        dedupedMap.set(key, e);
    }
    const deduped = Array.from(dedupedMap.values());

    await prisma.$transaction(async (tx) => {
        for (const entry of deduped) {
            await tx.customerProductPrice.upsert({
                where: {
                    customerId_productVariantId: {
                        customerId: entry.customerId,
                        productVariantId: entry.productVariantId,
                    },
                },
                create: {
                    customerId: entry.customerId,
                    productVariantId: entry.productVariantId,
                    unitPrice: new Prisma.Decimal(entry.price),
                    isActive: entry.isActive ?? true,
                    notes: entry.notes?.trim() || null,
                },
                update: {
                    unitPrice: new Prisma.Decimal(entry.price),
                    isActive: entry.isActive ?? true,
                    notes: entry.notes?.trim() || null,
                },
            });
        }
    });

    return { count: deduped.length };
}

// ── Bulk adjust internals ─────────────────────────────────────────────

function computeNewPrice(
    oldPrice: number,
    mode: BulkAdjustMode,
    value: number,
): number {
    if (mode === 'PERCENT') {
        // value e.g. 10 => +10%, -5 => -5%
        const raw = oldPrice * (1 + value / 100);
        // round to 2 decimals for currency safety, keep integer friendly
        return Math.round(raw * 100) / 100;
    }
    // AMOUNT
    const raw = oldPrice + value;
    return Math.round(raw * 100) / 100;
}

function validateAdjustInput(
    filter: BulkAdjustFilter,
    mode: BulkAdjustMode,
    value: number,
) {
    if (!['PERCENT', 'AMOUNT'].includes(mode)) {
        throw new ValidationError('Mode harus PERCENT atau AMOUNT');
    }
    if (!Number.isFinite(value)) {
        throw new ValidationError('Nilai penyesuaian tidak valid');
    }
    if (
        Object.keys(filter).length === 0 ||
        Object.values(filter).every((v) => v == null || v === '')
    ) {
        // Require at least one filter to avoid accidental mass update of whole table.
        throw new ValidationError(
            'Filter penyesuaian massal wajib diisi (customerId / productVariantId / category)',
        );
    }
}

async function fetchAdjustCandidates(filter: BulkAdjustFilter) {
    const where: Prisma.CustomerProductPriceWhereInput = {};

    // isActive handling: null means no filter, undefined => default true (respect active)
    const isActiveFilter =
        filter.isActive === null ? undefined : (filter.isActive ?? true);
    if (isActiveFilter !== undefined) where.isActive = isActiveFilter;

    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.productVariantId)
        where.productVariantId = filter.productVariantId;
    if (filter.category) {
        where.productVariant = {
            product: { productType: filter.category },
        } as Prisma.ProductVariantWhereInput;
    }

    // Always exclude prices where customer is inactive — per spec: "produk/customer inactive tidak ikut ke-adjust"
    // Handle via AND: isActive true handled above + customer isActive true
    const finalWhere: Prisma.CustomerProductPriceWhereInput = {
        AND: [where, { customer: { isActive: true } }],
    };

    const rows = await prisma.customerProductPrice.findMany({
        where: finalWhere,
        include: {
            customer: { select: { name: true } },
            productVariant: { select: { name: true, skuCode: true } },
        },
        orderBy: [{ customerId: 'asc' }, { productVariantId: 'asc' }],
    });

    return rows.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        productVariantId: r.productVariantId,
        unitPrice: Number(r.unitPrice),
        customerName: r.customer.name,
        productName: r.productVariant.name,
        skuCode: r.productVariant.skuCode,
    }));
}

/**
 * Preview bulk adjust without writing. Wajib dipanggil sebelum apply (no undo).
 * Respects isActive = true for price + customer.isActive = true.
 */
export async function previewBulkAdjustPrices(input: {
    filter: BulkAdjustFilter;
    mode: BulkAdjustMode;
    value: number;
}): Promise<BulkAdjustPreviewResult> {
    validateAdjustInput(input.filter, input.mode, input.value);

    const candidates = await fetchAdjustCandidates(input.filter);

    // 0% or 0 amount -> preview empty (no change)
    if (input.value === 0) {
        return {
            preview: [],
            affectedCount: 0,
            totalFiltered: candidates.length,
        };
    }

    const preview: BulkAdjustPreviewRow[] = [];
    for (const c of candidates) {
        const newPrice = computeNewPrice(c.unitPrice, input.mode, input.value);
        if (newPrice < 0) {
            throw new BusinessRuleError(
                `Hasil penyesuaian untuk ${c.skuCode} negatif (${newPrice}). Batalkan operasi.`,
            );
        }
        if (newPrice !== c.unitPrice) {
            preview.push({
                id: c.id,
                customerId: c.customerId,
                productVariantId: c.productVariantId,
                oldPrice: c.unitPrice,
                newPrice,
                customerName: c.customerName,
                productName: c.productName,
                skuCode: c.skuCode,
            });
        }
    }

    return {
        preview,
        affectedCount: preview.length,
        totalFiltered: candidates.length,
    };
}

/**
 * Apply bulk adjust in transaction. WAJIB preview dulu di UI (consumer must call previewBulkAdjust first).
 * Operation: ALL-OR-NOTHING transaction.
 */
export async function applyBulkAdjustPrices(input: {
    filter: BulkAdjustFilter;
    mode: BulkAdjustMode;
    value: number;
}): Promise<BulkAdjustApplyResult> {
    validateAdjustInput(input.filter, input.mode, input.value);

    if (input.value === 0) {
        return { updatedCount: 0, preview: [] };
    }

    const candidates = await fetchAdjustCandidates(input.filter);

    const toUpdate: BulkAdjustPreviewRow[] = [];
    for (const c of candidates) {
        const newPrice = computeNewPrice(c.unitPrice, input.mode, input.value);
        if (newPrice < 0) {
            throw new BusinessRuleError(
                `Hasil penyesuaian untuk ${c.skuCode} negatif (${newPrice}). Batalkan operasi.`,
            );
        }
        if (newPrice !== c.unitPrice) {
            toUpdate.push({
                id: c.id,
                customerId: c.customerId,
                productVariantId: c.productVariantId,
                oldPrice: c.unitPrice,
                newPrice,
                customerName: c.customerName,
                productName: c.productName,
                skuCode: c.skuCode,
            });
        }
    }

    if (toUpdate.length === 0) {
        return { updatedCount: 0, preview: [] };
    }

    await prisma.$transaction(async (tx) => {
        for (const row of toUpdate) {
            await tx.customerProductPrice.update({
                where: { id: row.id },
                data: { unitPrice: new Prisma.Decimal(row.newPrice) },
            });
        }
    });

    return { updatedCount: toUpdate.length, preview: toUpdate };
}

/**
 * Unified entry: forces dryRun param. If dryRun true -> preview only, false -> apply.
 * Provided for backwards compatibility with spec field `bulkAdjustPrices({ ..., dryRun })`.
 */
export async function bulkAdjustPrices(
    input: BulkAdjustInput,
): Promise<BulkAdjustPreviewResult | BulkAdjustApplyResult> {
    if (input.dryRun) {
        return previewBulkAdjustPrices({
            filter: input.filter,
            mode: input.mode,
            value: input.value,
        });
    }
    return applyBulkAdjustPrices({
        filter: input.filter,
        mode: input.mode,
        value: input.value,
    });
}

/**
 * Compatibility shim for CustomerProductPricesManager.
 * Ensures single write path for same table (price-list-service is source of truth).
 * Existing actions in customer-product-prices.ts can call this to avoid divergent logic.
 */
export async function upsertSinglePrice(entry: BulkUpsertEntry): Promise<void> {
    await bulkUpsertPrices([entry]);
}

// ── Product-first price list (master-detail) ──────────────────────────

/** Kategori produk yang tampil di price list secara default (belum diminta eksplisit). */
const DEFAULT_PRICE_LIST_CATEGORIES: ProductType[] = [
    ProductType.FINISHED_GOOD,
    ProductType.PACKAGING,
];

export type ListPricesByProductParams = {
    search?: string;
    /** Filter product.productType. Default: FINISHED_GOOD + PACKAGING. */
    category?: ProductType;
    /** Batasi baris SKU ke yang punya harga untuk customer ini, DAN batasi
     * detail `prices[]` ke customer itu saja. */
    customerId?: string;
    productVariantId?: string;
    /** Default false — SKU tanpa harga khusus tetap tampil. */
    onlyWithCustomPrice?: boolean;
    page?: number;
    pageSize?: number;
};

export type ProductPriceCustomerEntry = {
    id: string;
    customerId: string;
    customerName: string;
    customerCode: string | null;
    unitPrice: number;
    deviationPercent: number | null;
    isActive: boolean;
    notes: string | null;
};

export type ProductPriceRow = {
    variantId: string;
    skuCode: string;
    variantName: string;
    productName: string;
    productType: ProductType;
    basePrice: number | null;
    customPriceCount: number;
    minPrice: number | null;
    maxPrice: number | null;
    prices: ProductPriceCustomerEntry[];
};

export type ListPricesByProductResult = {
    data: ProductPriceRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

function buildProductPriceWhere(
    params: ListPricesByProductParams,
    customerPricesWhere: Prisma.CustomerProductPriceWhereInput,
): Prisma.ProductVariantWhereInput {
    const productTypeFilter = params.category ?? {
        in: DEFAULT_PRICE_LIST_CATEGORIES,
    };

    const searchTerm = params.search?.trim();
    const searchWhere: Prisma.ProductVariantWhereInput | undefined = searchTerm
        ? {
              OR: [
                  {
                      name: {
                          contains: searchTerm,
                          mode: 'insensitive' as const,
                      },
                  },
                  {
                      skuCode: {
                          contains: searchTerm,
                          mode: 'insensitive' as const,
                      },
                  },
                  {
                      product: {
                          name: {
                              contains: searchTerm,
                              mode: 'insensitive' as const,
                          },
                      },
                  },
                  {
                      customerPrices: {
                          some: {
                              // Same isActive/customerId narrowing as
                              // include.customerPrices.where, so a hit via
                              // this branch always has a matching row in the
                              // detail `prices[]` that gets included below.
                              ...customerPricesWhere,
                              customer: {
                                  name: {
                                      contains: searchTerm,
                                      mode: 'insensitive' as const,
                                  },
                              },
                          },
                      },
                  },
              ],
          }
        : undefined;

    // Row selection is narrowed to SKUs that have a matching custom price
    // whenever a customerId filter or onlyWithCustomPrice is requested.
    const restrictToCustomPrice = Boolean(
        params.customerId || params.onlyWithCustomPrice,
    );

    return {
        product: { productType: productTypeFilter },
        ...(params.productVariantId ? { id: params.productVariantId } : {}),
        ...(restrictToCustomPrice
            ? { customerPrices: { some: customerPricesWhere } }
            : {}),
        ...(searchWhere ?? {}),
    };
}

/**
 * List product variants as rows, with their active customer prices nested.
 * Paginates on SKU (ProductVariant), not on price rows — a SKU with 0 or many
 * customer overrides still counts as exactly 1 row for pagination purposes.
 */
export async function listPricesByProduct(
    params: ListPricesByProductParams = {},
): Promise<ListPricesByProductResult> {
    const page = normalizePage(params.page);
    const pageSize = clampPageSize(params.pageSize);
    const skip = (page - 1) * pageSize;

    // Detail restriction: always active-only, further narrowed to a single
    // customer when customerId is given. Independent of onlyWithCustomPrice.
    const customerPricesWhere: Prisma.CustomerProductPriceWhereInput = {
        isActive: true,
        ...(params.customerId ? { customerId: params.customerId } : {}),
    };

    const where = buildProductPriceWhere(params, customerPricesWhere);

    const [total, variants] = await Promise.all([
        prisma.productVariant.count({ where }),
        prisma.productVariant.findMany({
            where,
            include: {
                product: {
                    select: { id: true, name: true, productType: true },
                },
                customerPrices: {
                    where: customerPricesWhere,
                    include: {
                        customer: {
                            select: { id: true, name: true, code: true },
                        },
                    },
                },
            },
            orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
            skip,
            take: pageSize,
        }),
    ]);

    const data: ProductPriceRow[] = variants.map((variant) => {
        const basePrice = resolveBasePrice({
            sellPrice:
                variant.sellPrice != null ? Number(variant.sellPrice) : null,
            price: variant.price != null ? Number(variant.price) : null,
        });

        const prices: ProductPriceCustomerEntry[] = variant.customerPrices.map(
            (cp) => {
                const unitPrice = Number(cp.unitPrice);
                return {
                    id: cp.id,
                    customerId: cp.customerId,
                    customerName: cp.customer.name,
                    customerCode: cp.customer.code,
                    unitPrice,
                    deviationPercent: priceDeviationPercent(
                        unitPrice,
                        basePrice,
                    ),
                    isActive: cp.isActive,
                    notes: cp.notes,
                };
            },
        );

        const unitPrices = prices.map((p) => p.unitPrice);
        const minPrice = unitPrices.length ? Math.min(...unitPrices) : null;
        const maxPrice = unitPrices.length ? Math.max(...unitPrices) : null;

        return {
            variantId: variant.id,
            skuCode: variant.skuCode,
            variantName: variant.name,
            productName: variant.product.name,
            productType: variant.product.productType,
            basePrice,
            customPriceCount: prices.length,
            minPrice,
            maxPrice,
            prices,
        };
    });

    return {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}
