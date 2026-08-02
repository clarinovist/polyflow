'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { bulkUpsertPrices } from '@/services/sales/price-list-service';

const customerProductPriceSchema = z.object({
    customerId: z.string().min(1, 'Customer wajib dipilih'),
    productVariantId: z.string().min(1, 'Produk wajib dipilih'),
    unitPrice: z.coerce.number().nonnegative('Harga tidak boleh negatif'),
    isActive: z.boolean().optional().default(true),
    notes: z.string().optional(),
});

export type CustomerProductPriceValues = z.infer<
    typeof customerProductPriceSchema
>;

export const getCustomerProductPrices = withTenant(
    async function getCustomerProductPrices(customerId: string) {
        return safeAction(async () => {
            await requireSalesAccess();
            const prices = await prisma.customerProductPrice.findMany({
                where: { customerId },
                include: {
                    productVariant: {
                        include: { product: true },
                    },
                },
                orderBy: [
                    { isActive: 'desc' },
                    { productVariant: { product: { name: 'asc' } } },
                    { productVariant: { name: 'asc' } },
                ],
            });
            return serializeData(prices);
        });
    },
);

// Single write path: forward to price-list-service (source of truth for CustomerProductPrice).
// Keeps existing action signature intact so customer detail page keeps working.
// Existing guard: READ needed to upsert (SALES, MARKETING, ADMIN); price-list halaman
// uses MANAGER guard for bulk — intentional split: single-edit from customer page is
// allowed for sales staff, mass ops require manager.
export const upsertCustomerProductPrice = withTenant(
    async function upsertCustomerProductPrice(
        data: CustomerProductPriceValues,
    ) {
        return safeAction(async () => {
            await requireSalesAccess();
            const result = customerProductPriceSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            const { customerId, productVariantId, unitPrice, isActive, notes } =
                result.data;

            await bulkUpsertPrices([
                {
                    customerId,
                    productVariantId,
                    price: unitPrice,
                    isActive,
                    notes: notes?.trim() || null,
                },
            ]);

            revalidatePath(`/sales/customers/${customerId}`);
            revalidatePath('/sales/orders/create');
            return true;
        });
    },
);

// Deactivate kept as separate entry point for backward compat.
// Reason still two entry points: CustomerProductPricesManager imports this file,
// price-list page imports price-list actions. Both now funnel through same service
// for upsert, but deactivate stays here (price-list service uses isActive filter only).
// ponytail: if deactivate becomes shared, move to price-list-service.deactivatePrice().
export const deactivateCustomerProductPrice = withTenant(
    async function deactivateCustomerProductPrice(input: {
        customerId: string;
        productVariantId: string;
    }) {
        return safeAction(async () => {
            await requireSalesAccess();
            const customerId = z.string().min(1).parse(input.customerId);
            const productVariantId = z
                .string()
                .min(1)
                .parse(input.productVariantId);

            await prisma.customerProductPrice.update({
                where: {
                    customerId_productVariantId: {
                        customerId,
                        productVariantId,
                    },
                },
                data: { isActive: false },
            });

            revalidatePath(`/sales/customers/${customerId}`);
            revalidatePath('/sales/orders/create');
            return true;
        });
    },
);
