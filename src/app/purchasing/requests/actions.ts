'use server'

import { auth } from "@/auth";
import { PurchaseService } from "@/services/purchasing/purchase-service";
import { revalidatePath } from "next/cache";
import {
  AuthenticationError,
  safeAction,
} from "@/lib/errors/errors";

export async function convertToPo(requestId: string, supplierId: string) {
  return safeAction(async () => {
    const session = await auth();
    if (!session?.user) {
      throw new AuthenticationError();
    }

    const userId = session.user.id || "unknown";
    const result = await PurchaseService.convertRequestToOrder(
      requestId,
      supplierId,
      userId,
    );
    revalidatePath("/purchasing/requests");
    return { orderId: result.id };
  });
}
