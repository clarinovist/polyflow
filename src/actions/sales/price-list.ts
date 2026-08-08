'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import {
    requireSalesAccess,
    requireSalesManager,
} from '@/lib/auth/sales-access';
import {
    listPrices,
    listPricesByProduct,
    bulkUpsertPrices,
    previewBulkAdjustPrices,
    applyBulkAdjustPrices,
    bulkAdjustPrices,
} from '@/services/sales/price-list-service';
import type {
    ListPricesParams,
    ListPricesByProductParams,
    BulkUpsertEntry,
    BulkAdjustFilter,
    BulkAdjustMode,
} from '@/services/sales/price-list-service';
import {
    approvePrice as svcApprovePrice,
    rejectPrice as svcRejectPrice,
} from '@/services/sales/price-approval-service';
import { ProductType } from '@prisma/client';
import { serializeData } from '@/lib/utils/utils';

// ── Schemas ─────────────────────────────────────────────────────────────

const listPricesSchema = z.object({
    customerId: z.string().optional(),
    productVariantId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(200).optional(),
    isActive: z.boolean().nullable().optional(),
    category: z.nativeEnum(ProductType).optional(),
});

const listPricesByProductSchema = z.object({
    search: z.string().optional(),
    category: z.nativeEnum(ProductType).optional(),
    customerId: z.string().optional(),
    productVariantId: z.string().optional(),
    onlyWithCustomPrice: z.boolean().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(200).optional(),
});

const upsertEntrySchema = z.object({
    customerId: z.string().min(1),
    productVariantId: z.string().min(1),
    price: z.coerce.number().nonnegative('Harga tidak boleh negatif'),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    updatedById: z.string().optional(),
});

const bulkUpsertSchema = z.object({
    entries: z
        .array(upsertEntrySchema)
        .min(1, 'Daftar harga kosong')
        .max(1000, 'Maksimal 1000 baris per batch'),
});

const bulkAdjustFilterSchema = z.object({
    customerId: z.string().optional(),
    productVariantId: z.string().optional(),
    category: z.nativeEnum(ProductType).optional(),
    isActive: z.boolean().nullable().optional(),
});

const bulkAdjustPreviewSchema = z.object({
    filter: bulkAdjustFilterSchema.refine(
        (f) => !!(f.customerId || f.productVariantId || f.category),
        {
            message:
                'Filter penyesuaian massal wajib diisi (customerId / productVariantId / kategori)',
        },
    ),
    mode: z.enum(['PERCENT', 'AMOUNT'] as const),
    value: z.coerce
        .number()
        .refine((v) => Number.isFinite(v), { message: 'Nilai tidak valid' }),
});

const bulkAdjustApplySchema = bulkAdjustPreviewSchema;

// ── Actions ─────────────────────────────────────────────────────────────

/** Read: ADMIN | SALES | MARKETING */
export const listCustomerProductPricesAction = withTenant(
    async function listCustomerProductPricesAction(raw: ListPricesParams) {
        return safeAction(async () => {
            await requireSalesAccess();
            const parsed = listPricesSchema.safeParse(raw);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            const result = await listPrices(parsed.data);
            return serializeData(result);
        });
    },
);

/**
 * Read: ADMIN | SALES | MARKETING — produk-dulu master-detail (page /sales/price-list).
 * Paginasi menghitung SKU (ProductVariant), bukan baris harga.
 */
export const listPricesByProductAction = withTenant(
    async function listPricesByProductAction(raw: ListPricesByProductParams) {
        return safeAction(async () => {
            await requireSalesAccess();
            const parsed = listPricesByProductSchema.safeParse(raw);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            const result = await listPricesByProduct(parsed.data);
            return serializeData(result);
        });
    },
);

/** Write: ADMIN | MARKETING only (keputusan manajerial - plafon harga) */
export const bulkUpsertCustomerProductPricesAction = withTenant(
    async function bulkUpsertCustomerProductPricesAction(raw: {
        entries: BulkUpsertEntry[];
    }) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const parsed = bulkUpsertSchema.safeParse(raw);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            const entries: BulkUpsertEntry[] = parsed.data.entries.map((e) => ({
                customerId: e.customerId,
                productVariantId: e.productVariantId,
                price: e.price,
                notes: e.notes ?? null,
                isActive: e.isActive,
                updatedById: e.updatedById || session.user.id,
            }));
            const result = await bulkUpsertPrices(entries);
            revalidatePath('/sales/price-list');
            revalidatePath('/sales/customers');
            return serializeData(result);
        });
    },
);

/** Preview dry-run: read guard only (tidak menulis DB) */
export const previewBulkAdjustPricesAction = withTenant(
    async function previewBulkAdjustPricesAction(raw: {
        filter: BulkAdjustFilter;
        mode: BulkAdjustMode;
        value: number;
    }) {
        return safeAction(async () => {
            await requireSalesAccess();
            const parsed = bulkAdjustPreviewSchema.safeParse(raw);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            const result = await previewBulkAdjustPrices({
                filter: parsed.data.filter as BulkAdjustFilter,
                mode: parsed.data.mode,
                value: parsed.data.value,
            });
            return serializeData(result);
        });
    },
);

/** Apply: ADMIN | MARKETING only (operasi massal tanpa undo) */
export const applyBulkAdjustPricesAction = withTenant(
    async function applyBulkAdjustPricesAction(raw: {
        filter: BulkAdjustFilter;
        mode: BulkAdjustMode;
        value: number;
    }) {
        return safeAction(async () => {
            await requireSalesManager();
            const parsed = bulkAdjustApplySchema.safeParse(raw);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            const result = await applyBulkAdjustPrices({
                filter: parsed.data.filter as BulkAdjustFilter,
                mode: parsed.data.mode,
                value: parsed.data.value,
            });
            revalidatePath('/sales/price-list');
            return serializeData(result);
        });
    },
);

/**
 * Unified entry with explicit dryRun param (for spec compatibility).
 * Guard follows dryRun: read guard for preview, manager guard for apply.
 */
export const bulkAdjustCustomerProductPricesAction = withTenant(
    async function bulkAdjustCustomerProductPricesAction(raw: {
        filter: BulkAdjustFilter;
        mode: BulkAdjustMode;
        value: number;
        dryRun: boolean;
    }) {
        return safeAction(async () => {
            if (raw.dryRun) {
                await requireSalesAccess();
            } else {
                await requireSalesManager();
            }
            const modeSchema = z.enum(['PERCENT', 'AMOUNT'] as const);
            const parsedMode = modeSchema.safeParse(raw.mode);
            if (!parsedMode.success) {
                throw new BusinessRuleError('Mode harus PERCENT atau AMOUNT');
            }
            if (!Number.isFinite(raw.value)) {
                throw new BusinessRuleError('Nilai tidak valid');
            }
            if (
                !raw.filter ||
                (!raw.filter.customerId &&
                    !raw.filter.productVariantId &&
                    !raw.filter.category)
            ) {
                throw new BusinessRuleError(
                    'Filter penyesuaian massal wajib diisi (customerId / productVariantId / kategori)',
                );
            }
            const result = await bulkAdjustPrices({
                filter: raw.filter as BulkAdjustFilter,
                mode: raw.mode as BulkAdjustMode,
                value: raw.value,
                dryRun: !!raw.dryRun,
            });
            if (!raw.dryRun) {
                revalidatePath('/sales/price-list');
            }
            return serializeData(result);
        });
    },
);

/** Upsert single price - ADMIN | MARKETING */
export const upsertSinglePriceAction = withTenant(
    async function upsertSinglePriceAction(raw: {
        customerId: string;
        productVariantId: string;
        price: number;
        notes?: string | null;
    }) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const parsed = upsertEntrySchema.safeParse({
                ...raw,
                updatedById: session.user.id,
            });
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            await bulkUpsertPrices([
                {
                    customerId: parsed.data.customerId,
                    productVariantId: parsed.data.productVariantId,
                    price: parsed.data.price,
                    notes: parsed.data.notes ?? null,
                    isActive: parsed.data.isActive,
                    updatedById: session.user.id,
                },
            ]);
            revalidatePath('/sales/price-list');
            revalidatePath(`/sales/customers/${raw.customerId}`);
            revalidatePath('/sales/orders/create');
            return true;
        });
    },
);

// ── Price approval actions (Fase B) — ADMIN + MARKETING ────────────────

const priceApprovalSchema = z.object({
    orderId: z.string().min(1),
    notes: z.string().optional(),
});

const priceRejectionSchema = z.object({
    orderId: z.string().min(1),
    notes: z.string().min(1, 'Alasan penolakan harga wajib diisi'),
});

/** Approve PENDING → PROVISIONAL */
export const approvePriceAction = withTenant(
    async function approvePriceAction(raw: {
        orderId: string;
        notes?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const parsed = priceApprovalSchema.safeParse(raw);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            const result = await svcApprovePrice(
                parsed.data.orderId,
                session.user.id,
                parsed.data.notes,
            );
            revalidatePath(`/sales/orders/${parsed.data.orderId}`);
            revalidatePath('/sales/orders');
            return serializeData(result);
        });
    },
);

/** Reject PENDING (stay PENDING) + log */
export const rejectPriceAction = withTenant(
    async function rejectPriceAction(raw: { orderId: string; notes: string }) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const parsed = priceRejectionSchema.safeParse(raw);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            const result = await svcRejectPrice(
                parsed.data.orderId,
                session.user.id,
                parsed.data.notes,
            );
            revalidatePath(`/sales/orders/${parsed.data.orderId}`);
            revalidatePath('/sales/orders');
            return serializeData(result);
        });
    },
);
