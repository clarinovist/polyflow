'use server'

import { auth } from "@/auth";
import { PurchaseService } from "@/services/purchase-service";
import { revalidatePath } from "next/cache";

export async function convertToPo(requestId: string, supplierId: string) {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    // Use session user ID or fallback
    const userId = session.user.id || 'unknown';

    const result = await PurchaseService.convertRequestToOrder(requestId, supplierId, userId);
    revalidatePath('/planning/purchase-requests');
    return { success: true, orderId: result.id };
}
