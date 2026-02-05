'use server';

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

export async function createPurchaseOrder(formData: CreatePurchaseOrderValues) {
    const session = await requireAuth();
    const validated = createPurchaseOrderSchema.parse(formData);

    const order = await PurchaseService.createOrder(validated, session.user.id);

    revalidatePath('/planning/purchase-orders');
    return serializeData(order);
}

export async function createManualPurchaseRequest(data: CreatePurchaseRequestValues) {
    const session = await requireAuth();
    const validated = createPurchaseRequestSchema.parse(data);

    const pr = await PurchaseService.createPurchaseRequest(validated, session.user.id);

    revalidatePath('/planning/purchase-requests');
    return serializeData(pr);
}

export async function updatePurchaseOrder(formData: UpdatePurchaseOrderValues) {
    await requireAuth();
    const validated = updatePurchaseOrderSchema.parse(formData);

    const order = await PurchaseService.updateOrder(validated);

    revalidatePath('/planning/purchase-orders');
    revalidatePath(`/planning/purchase-orders/${validated.id}`);
    return serializeData(order);
}

export async function createGoodsReceipt(formData: CreateGoodsReceiptValues) {
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

export async function createPurchaseInvoice(formData: CreatePurchaseInvoiceValues) {
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

export async function recordPurchasePayment(id: string, amount: number) {
    const session = await requireAuth();
    const updated = await PurchaseService.recordPayment(id, amount, session.user.id);

    revalidatePath('/finance/invoices/purchase');
    revalidatePath(`/finance/invoices/${id}`);
    revalidatePath(`/finance/invoices/${id}`);

    // Auto-Journal: Purchase Payment
    await AutoJournalService.handlePurchasePayment(id, amount).catch(console.error);

    return serializeData(updated);
}

export async function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
    const session = await requireAuth();
    const order = await PurchaseService.updateOrderStatus(id, status, session.user.id);

    revalidatePath('/planning/purchase-orders');
    revalidatePath(`/planning/purchase-orders/${id}`);
    return serializeData(order);
}

export async function deletePurchaseOrder(id: string) {
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

export async function getPurchaseOrders(filters?: { supplierId?: string, status?: PurchaseOrderStatus }) {
    await requireAuth();
    const orders = await PurchaseService.getPurchaseOrders(filters);
    return serializeData(orders);
}

export async function getPurchaseOrderById(id: string) {
    await requireAuth();
    const order = await PurchaseService.getPurchaseOrderById(id);
    return serializeData(order);
}

export async function getGoodsReceiptById(id: string) {
    await requireAuth();
    const receipt = await PurchaseService.getGoodsReceiptById(id);
    return serializeData(receipt);
}

export async function getGoodsReceipts() {
    await requireAuth();
    const receipts = await PurchaseService.getGoodsReceipts();
    return serializeData(receipts);
}

export async function getPurchaseInvoiceById(id: string) {
    await requireAuth();
    const invoice = await PurchaseService.getPurchaseInvoiceById(id);
    return serializeData(invoice);
}

export async function getPurchaseInvoices() {
    await requireAuth();
    const invoices = await PurchaseService.getPurchaseInvoices();
    return serializeData(invoices);
}

export async function consolidatePurchaseRequests(requestIds: string[], supplierId: string) {
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
