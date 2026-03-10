"use server";

import { requireAuth } from "@/lib/auth-checks";
import { withTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { PurchaseReturnService } from "@/services/purchasing/returns-service";
import { createPurchaseReturnSchema, updatePurchaseReturnSchema } from "@/lib/schemas/returns";
import * as z from "zod";

export const getPurchaseReturns = withTenant(async (filters?: Record<string, unknown>) => {
  await requireAuth();
  const returns = await PurchaseReturnService.getReturns(filters);
  return returns;
});

export const getPurchaseReturnById = withTenant(async (id: string) => {
  await requireAuth();
  const purchaseReturn = await PurchaseReturnService.getReturnById(id);
  return purchaseReturn;
});

export const createPurchaseReturnAction = withTenant(async (data: z.infer<typeof createPurchaseReturnSchema>) => {
  const session = await requireAuth();
  const parsedData = createPurchaseReturnSchema.parse(data);

  const purchaseReturn = await PurchaseReturnService.createReturn(parsedData, session.user.id);
  
  revalidatePath("/planning/purchase-returns");
  return { success: true, data: purchaseReturn };
});

export const updatePurchaseReturnAction = withTenant(async (data: z.infer<typeof updatePurchaseReturnSchema>) => {
  const session = await requireAuth();
  const parsedData = updatePurchaseReturnSchema.parse(data);

  const purchaseReturn = await PurchaseReturnService.updateReturn(parsedData, session.user.id);
  
  revalidatePath("/planning/purchase-returns");
  revalidatePath(`/planning/purchase-returns/${purchaseReturn.id}`);
  return { success: true, data: purchaseReturn };
});

export const confirmPurchaseReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const purchaseReturn = await PurchaseReturnService.confirmReturn(id, session.user.id);
  
  revalidatePath("/planning/purchase-returns");
  revalidatePath(`/planning/purchase-returns/${id}`);
  return { success: true, data: purchaseReturn };
});

export const shipPurchaseReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const purchaseReturn = await PurchaseReturnService.shipReturn(id, session.user.id);
  
  revalidatePath("/planning/purchase-returns");
  revalidatePath(`/planning/purchase-returns/${id}`);
  return { success: true, data: purchaseReturn };
});

export const completePurchaseReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const purchaseReturn = await PurchaseReturnService.completeReturn(id, session.user.id);
  
  revalidatePath("/planning/purchase-returns");
  revalidatePath(`/planning/purchase-returns/${id}`);
  return { success: true, data: purchaseReturn };
});

export const cancelPurchaseReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const purchaseReturn = await PurchaseReturnService.cancelReturn(id, session.user.id);
  
  revalidatePath("/planning/purchase-returns");
  revalidatePath(`/planning/purchase-returns/${id}`);
  return { success: true, data: purchaseReturn };
});
