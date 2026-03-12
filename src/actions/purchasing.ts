'use server';

import { withTenant } from "@/lib/tenant";
import {
    createPurchaseOrderSchema,
    updatePurchaseOrderSchema,
    createGoodsReceiptSchema,
    createPurchaseInvoiceSchema
} from '@/lib/schemas/purchasing';
import { PurchaseService } from '@/services/purchase-service';
import { requireAuth } from '@/lib/auth-checks';
import { revalidatePath } from 'next/cache';
import {
    CreatePurchaseOrderValues,
    UpdatePurchaseOrderValues,
    CreateGoodsReceiptValues,
    CreatePurchaseInvoiceValues,
    CreatePurchaseRequestValues,
    createPurchaseRequestSchema
} from '@/lib/schemas/purchasing';
import { PurchaseOrderStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils';
import { AutoJournalService } from '@/services/finance/auto-journal-service';
import { logActivity } from '@/lib/audit';

export const createPurchaseOrder = withTenant(
async function createPurchaseOrder(formData: CreatePurchaseOrderValues) {
    const session = await requireAuth();
    const validated = createPurchaseOrderSchema.parse(formData);

    const order = await PurchaseService.createOrder(validated, session.user.id);

    await logActivity({
        userId: session.user.id,
        action: 'CREATE_PURCHASE_ORDER',
        entityType: 'PurchaseOrder',
        entityId: order.id,
        details: `Created Purchase Order ${order.orderNumber}`
    });

    revalidatePath('/planning/purchase-orders');
    return serializeData(order);
}
);

export const createManualPurchaseRequest = withTenant(
async function createManualPurchaseRequest(data: CreatePurchaseRequestValues) {
    const session = await requireAuth();
    const validated = createPurchaseRequestSchema.parse(data);

    const pr = await PurchaseService.createPurchaseRequest(validated, session.user.id);

    revalidatePath('/planning/purchase-requests');
    return serializeData(pr);
}
);

export const updatePurchaseOrder = withTenant(
async function updatePurchaseOrder(formData: UpdatePurchaseOrderValues) {
    const session = await requireAuth();
    const validated = updatePurchaseOrderSchema.parse(formData);

    const order = await PurchaseService.updateOrder(validated);

    await logActivity({
        userId: session.user.id,
        action: 'UPDATE_PURCHASE_ORDER',
        entityType: 'PurchaseOrder',
        entityId: order.id,
        details: `Updated Purchase Order ${order.orderNumber}`
    });

    revalidatePath('/planning/purchase-orders');
    revalidatePath(`/planning/purchase-orders/${validated.id}`);
    return serializeData(order);
}
);

export const createGoodsReceipt = withTenant(
async function createGoodsReceipt(formData: CreateGoodsReceiptValues) {
    const session = await requireAuth();
    const validated = createGoodsReceiptSchema.parse(formData);

    const receipt = await PurchaseService.createGoodsReceipt(validated, session.user.id);

    revalidatePath('/planning/purchase-orders');
    revalidatePath(`/planning/purchase-orders/${validated.purchaseOrderId}`);
    revalidatePath('/warehouse/incoming');
    revalidatePath(`/warehouse/incoming/create-receipt`);
    revalidatePath('/warehouse/inventory');
    return serializeData(receipt);
}
);

export const createPurchaseInvoice = withTenant(
async function createPurchaseInvoice(formData: CreatePurchaseInvoiceValues) {
    await requireAuth();
    const validated = createPurchaseInvoiceSchema.parse(formData);

    const invoice = await PurchaseService.createInvoice(validated);

    revalidatePath('/finance/invoices/purchase');
    revalidatePath(`/planning/purchase-orders/${validated.purchaseOrderId}`);
    revalidatePath(`/planning/purchase-orders/${validated.purchaseOrderId}`);

    // Auto-Journal: Purchase Invoice
    await AutoJournalService.handlePurchaseInvoiceCreated(invoice.id).catch(console.error);

    return serializeData(invoice);
}
);

export const recordPurchasePayment = withTenant(
async function recordPurchasePayment(id: string, amount: number) {
    const session = await requireAuth();
    const updated = await PurchaseService.recordPayment(id, amount, session.user.id);

    revalidatePath('/finance/invoices/purchase');
    revalidatePath(`/finance/invoices/${id}`);
    revalidatePath(`/finance/invoices/${id}`);

    // Auto-Journal: Purchase Payment
    await AutoJournalService.handlePurchasePayment(id, amount).catch(console.error);

    return serializeData(updated);
}
);

export const updatePurchaseOrderStatus = withTenant(
async function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
    const session = await requireAuth();
    const order = await PurchaseService.updateOrderStatus(id, status, session.user.id);

    await logActivity({
        userId: session.user.id,
        action: `UPDATE_PO_STATUS`,
        entityType: 'PurchaseOrder',
        entityId: order.id,
        details: `Status changed to ${status}`
    });

    revalidatePath('/planning/purchase-orders');
    revalidatePath(`/planning/purchase-orders/${id}`);
    return serializeData(order);
}
);

export const deletePurchaseOrder = withTenant(
async function deletePurchaseOrder(id: string) {
    const session = await requireAuth();

    try {
        const result = await PurchaseService.deleteOrder(id, session.user.id);
        revalidatePath('/planning/purchase-orders');
        revalidatePath('/planning/purchase-orders');
        return { success: true, orderNumber: result.orderNumber };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete order'
        };
    }
}
);

export const getPurchaseOrders = withTenant(
async function getPurchaseOrders(filters?: { supplierId?: string, status?: PurchaseOrderStatus }) {
    await requireAuth();
    const orders = await PurchaseService.getPurchaseOrders(filters);
    return serializeData(orders);
}
);

export const getPurchaseOrderById = withTenant(
async function getPurchaseOrderById(id: string) {
    await requireAuth();
    const order = await PurchaseService.getPurchaseOrderById(id);
    return serializeData(order);
}
);

export const getGoodsReceiptById = withTenant(
async function getGoodsReceiptById(id: string) {
    await requireAuth();
    const receipt = await PurchaseService.getGoodsReceiptById(id);
    return serializeData(receipt);
}
);

export const getGoodsReceipts = withTenant(
async function getGoodsReceipts() {
    await requireAuth();
    const receipts = await PurchaseService.getGoodsReceipts();
    return serializeData(receipts);
}
);

export const getPurchaseInvoiceById = withTenant(
async function getPurchaseInvoiceById(id: string) {
    await requireAuth();
    const invoice = await PurchaseService.getPurchaseInvoiceById(id);
    return serializeData(invoice);
}
);

export const getPurchaseInvoices = withTenant(
async function getPurchaseInvoices() {
    await requireAuth();
    const invoices = await PurchaseService.getPurchaseInvoices();
    return serializeData(invoices);
}
);

export const consolidatePurchaseRequests = withTenant(
async function consolidatePurchaseRequests(requestIds: string[], supplierId: string) {
    const session = await requireAuth();
    try {
        const po = await PurchaseService.consolidateRequestsToOrder(requestIds, supplierId, session.user.id);
        revalidatePath('/planning/purchase-requests');
        revalidatePath('/planning/purchase-orders');
        return { success: true, data: serializeData(po) };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to consolidate requests'
        };
    }
}
);
