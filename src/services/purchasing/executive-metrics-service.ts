import { prisma } from '@/lib/core/prisma';
import { PurchaseOrderStatus } from '@prisma/client';

export type ExecutivePurchasingMetrics = {
    pendingPOs: number;
};

export async function getExecutivePurchasingMetrics(): Promise<ExecutivePurchasingMetrics> {
    const pendingPOs = await prisma.purchaseOrder.count({
        where: {
            status: {
                in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT],
            },
        },
    });

    return { pendingPOs };
}
