"use server";

import { requireAuth } from "@/lib/tools/auth-checks";
import { withTenant } from "@/lib/core/tenant";
import { revalidatePath } from "next/cache";
import { PurchaseReturnService } from "@/services/purchasing/returns-service";
import { createPurchaseReturnSchema, updatePurchaseReturnSchema } from "@/lib/schemas/returns";
import * as z from "zod";
import { safeAction } from "@/lib/errors/errors";

export const getPurchaseReturns = withTenant(
async function getPurchaseReturns(filters?: Record<string, unknown>) {
  return safeAction(async () => {
    await requireAuth();
    const returns = await PurchaseReturnService.getReturns(filters);
    return returns;
  });
}
);

export const getPurchaseReturnById = withTenant(
async function getPurchaseReturnById(id: string) {
  return safeAction(async () => {
    await requireAuth();
    const purchaseReturn = await PurchaseReturnService.getReturnById(id);
    return purchaseReturn;
  });
}
);

export const createPurchaseReturnAction = withTenant(
async function createPurchaseReturnAction(data: z.infer<typeof createPurchaseReturnSchema>) {
  return safeAction(async () => {
    const session = await requireAuth();
    const parsedData = createPurchaseReturnSchema.parse(data);
    const purchaseReturn = await PurchaseReturnService.createReturn(parsedData, session.user.id);
    
    revalidatePath("/planning/purchase-returns");
    return purchaseReturn;
  });
}
);

export const updatePurchaseReturnAction = withTenant(
async function updatePurchaseReturnAction(data: z.infer<typeof updatePurchaseReturnSchema>) {
  return safeAction(async () => {
    const session = await requireAuth();
    const parsedData = updatePurchaseReturnSchema.parse(data);
    const purchaseReturn = await PurchaseReturnService.updateReturn(parsedData, session.user.id);
    
    revalidatePath("/planning/purchase-returns");
    revalidatePath(`/planning/purchase-returns/${purchaseReturn.id}`);
    return purchaseReturn;
  });
}
);

export const confirmPurchaseReturnAction = withTenant(
async function confirmPurchaseReturnAction(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const purchaseReturn = await PurchaseReturnService.confirmReturn(id, session.user.id);
    revalidatePath("/planning/purchase-returns");
    revalidatePath(`/planning/purchase-returns/${id}`);
    return purchaseReturn;
  });
}
);

export const shipPurchaseReturnAction = withTenant(
async function shipPurchaseReturnAction(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const purchaseReturn = await PurchaseReturnService.shipReturn(id, session.user.id);
    revalidatePath("/planning/purchase-returns");
    revalidatePath(`/planning/purchase-returns/${id}`);
    return purchaseReturn;
  });
}
);

export const completePurchaseReturnAction = withTenant(
async function completePurchaseReturnAction(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const purchaseReturn = await PurchaseReturnService.completeReturn(id, session.user.id);
    revalidatePath("/planning/purchase-returns");
    revalidatePath(`/planning/purchase-returns/${id}`);
    return purchaseReturn;
  });
}
);

export const cancelPurchaseReturnAction = withTenant(
async function cancelPurchaseReturnAction(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const purchaseReturn = await PurchaseReturnService.cancelReturn(id, session.user.id);
    revalidatePath("/planning/purchase-returns");
    revalidatePath(`/planning/purchase-returns/${id}`);
    return purchaseReturn;
  });
}
);
