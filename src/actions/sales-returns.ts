"use server";

import { requireAuth } from "@/lib/auth-checks";
import { withTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { SalesReturnService } from "@/services/sales/returns-service";
import { createSalesReturnSchema, updateSalesReturnSchema } from "@/lib/schemas/returns";
import * as z from "zod";

export const getSalesReturns = withTenant(async (filters?: Record<string, unknown>) => {
  await requireAuth();
  const returns = await SalesReturnService.getReturns(filters);
  return returns; // Assumes serializeData is done at component level or not needed if no Dates are strictly passed to client
});

export const getSalesReturnById = withTenant(async (id: string) => {
  await requireAuth();
  const salesReturn = await SalesReturnService.getReturnById(id);
  return salesReturn;
});

export const createSalesReturnAction = withTenant(async (data: z.infer<typeof createSalesReturnSchema>) => {
  const session = await requireAuth();
  const parsedData = createSalesReturnSchema.parse(data);

  const salesReturn = await SalesReturnService.createReturn(parsedData, session.user.id);
  
  revalidatePath("/sales/returns");
  return { success: true, data: salesReturn };
});

export const updateSalesReturnAction = withTenant(async (data: z.infer<typeof updateSalesReturnSchema>) => {
  const session = await requireAuth();
  const parsedData = updateSalesReturnSchema.parse(data);

  const salesReturn = await SalesReturnService.updateReturn(parsedData, session.user.id);
  
  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${salesReturn.id}`);
  return { success: true, data: salesReturn };
});

export const confirmSalesReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const salesReturn = await SalesReturnService.confirmReturn(id, session.user.id);
  
  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${id}`);
  return { success: true, data: salesReturn };
});

export const receiveSalesReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const salesReturn = await SalesReturnService.receiveReturn(id, session.user.id);
  
  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${id}`);
  return { success: true, data: salesReturn };
});

export const completeSalesReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const salesReturn = await SalesReturnService.completeReturn(id, session.user.id);
  
  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${id}`);
  return { success: true, data: salesReturn };
});

export const cancelSalesReturnAction = withTenant(async (id: string) => {
  const session = await requireAuth();
  
  const salesReturn = await SalesReturnService.cancelReturn(id, session.user.id);
  
  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${id}`);
  return { success: true, data: salesReturn };
});
