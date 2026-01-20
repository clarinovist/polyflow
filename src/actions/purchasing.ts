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
    CreatePurchaseInvoiceValues
} from '@/lib/schemas/purchasing';
import { PurchaseOrderStatus } from '@prisma/client';
import { serializeForClient } from '@/lib/serialize';

export async function createPurchaseOrder(formData: CreatePurchaseOrderValues) {
    const session = await requireAuth();
    const validated = createPurchaseOrderSchema.parse(formData);

    const order = await PurchaseService.createOrder(validated, session.user.id);

    revalidatePath('/dashboard/purchasing');
    revalidatePath('/dashboard/purchasing/orders');
    return serializeForClient(order);
}

export async function updatePurchaseOrder(formData: UpdatePurchaseOrderValues) {
    await requireAuth();
    const validated = updatePurchaseOrderSchema.parse(formData);

    const order = await PurchaseService.updateOrder(validated);

    revalidatePath('/dashboard/purchasing/orders');
    revalidatePath(`/dashboard/purchasing/orders/${validated.id}`);
    return serializeForClient(order);
}

export async function createGoodsReceipt(formData: CreateGoodsReceiptValues) {
    const session = await requireAuth();
    const validated = createGoodsReceiptSchema.parse(formData);

    const receipt = await PurchaseService.createGoodsReceipt(validated, session.user.id);

    revalidatePath('/dashboard/purchasing/orders');
    revalidatePath(`/dashboard/purchasing/orders/${validated.purchaseOrderId}`);
    revalidatePath('/dashboard/purchasing/receipts');
    revalidatePath(`/dashboard/purchasing/receipts/create`);
    revalidatePath('/dashboard/inventory');
    return serializeForClient(receipt);
}

export async function createPurchaseInvoice(formData: CreatePurchaseInvoiceValues) {
    await requireAuth();
    const validated = createPurchaseInvoiceSchema.parse(formData);

    const invoice = await PurchaseService.createInvoice(validated);

    revalidatePath('/dashboard/purchasing/invoices');
    revalidatePath(`/dashboard/purchasing/orders/${validated.purchaseOrderId}`);
    return serializeForClient(invoice);
}

export async function recordPurchasePayment(id: string, amount: number) {
    const session = await requireAuth();
    const updated = await PurchaseService.recordPayment(id, amount, session.user.id);

    revalidatePath('/dashboard/purchasing/invoices');
    revalidatePath(`/dashboard/purchasing/invoices/${id}`);
    return serializeForClient(updated);
}

export async function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
    const session = await requireAuth();
    const order = await PurchaseService.updateOrderStatus(id, status, session.user.id);

    revalidatePath('/dashboard/purchasing/orders');
    revalidatePath(`/dashboard/purchasing/orders/${id}`);
    return serializeForClient(order);
}

export async function deletePurchaseOrder(id: string) {
    const session = await requireAuth();

    try {
        const result = await PurchaseService.deleteOrder(id, session.user.id);
        revalidatePath('/dashboard/purchasing/orders');
        return { success: true, orderNumber: result.orderNumber };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete order'
        };
    }
}
