import {
    Prisma,
    PurchaseOrderStatus,
    PurchaseRequestStatus,
    type PurchaseOrderStatus as PurchaseOrderStatusValue,
} from '@prisma/client';

export const PURCHASING_DASHBOARD_WAITING_RECEIPT_STATUSES = [
    PurchaseOrderStatus.SENT,
    PurchaseOrderStatus.PARTIAL_RECEIVED,
] as const;

export function buildPurchasingDashboardAwaitingApprovalRequestWhere(): Prisma.PurchaseRequestWhereInput {
    return { status: PurchaseRequestStatus.OPEN };
}

export function buildPurchasingDashboardWaitingReceiptWhere(
    status?: PurchaseOrderStatusValue,
): Prisma.PurchaseOrderWhereInput {
    return {
        status: status ?? {
            in: [...PURCHASING_DASHBOARD_WAITING_RECEIPT_STATUSES],
        },
    };
}
