"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { requireAuth } from "@/lib/tools/auth-checks";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { serializeData } from "@/lib/utils/utils";

const customerProductPriceSchema = z.object({
  customerId: z.string().min(1, "Customer wajib dipilih"),
  productVariantId: z.string().min(1, "Produk wajib dipilih"),
  unitPrice: z.coerce.number().nonnegative("Harga tidak boleh negatif"),
  isActive: z.boolean().optional().default(true),
  notes: z.string().optional(),
});

export type CustomerProductPriceValues = z.infer<
  typeof customerProductPriceSchema
>;

export const getCustomerProductPrices = withTenant(
  async function getCustomerProductPrices(customerId: string) {
    return safeAction(async () => {
      await requireAuth();
      const prices = await prisma.customerProductPrice.findMany({
        where: { customerId },
        include: {
          productVariant: {
            include: { product: true },
          },
        },
        orderBy: [
          { isActive: "desc" },
          { productVariant: { product: { name: "asc" } } },
          { productVariant: { name: "asc" } },
        ],
      });
      return serializeData(prices);
    });
  },
);

export const upsertCustomerProductPrice = withTenant(
  async function upsertCustomerProductPrice(data: CustomerProductPriceValues) {
    return safeAction(async () => {
      await requireAuth();
      const result = customerProductPriceSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      const { customerId, productVariantId, unitPrice, isActive, notes } =
        result.data;

      await prisma.customerProductPrice.upsert({
        where: {
          customerId_productVariantId: {
            customerId,
            productVariantId,
          },
        },
        create: {
          customerId,
          productVariantId,
          unitPrice,
          isActive,
          notes: notes?.trim() || null,
        },
        update: {
          unitPrice,
          isActive,
          notes: notes?.trim() || null,
        },
      });

      revalidatePath(`/sales/customers/${customerId}`);
      revalidatePath("/sales/orders/create");
      revalidatePath("/sales/quotations/create");
      return true;
    });
  },
);

export const deactivateCustomerProductPrice = withTenant(
  async function deactivateCustomerProductPrice(input: {
    customerId: string;
    productVariantId: string;
  }) {
    return safeAction(async () => {
      await requireAuth();
      const customerId = z.string().min(1).parse(input.customerId);
      const productVariantId = z.string().min(1).parse(input.productVariantId);

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
      revalidatePath("/sales/orders/create");
      revalidatePath("/sales/quotations/create");
      return true;
    });
  },
);
