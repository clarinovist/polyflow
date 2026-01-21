'use server';

import { auth } from '@/auth';
import { QuotationService } from '@/services/quotation-service';
import { CreateSalesQuotationValues, UpdateSalesQuotationValues } from '@/lib/schemas/quotation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function getQuotations() {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");
    return await QuotationService.getQuotations();
}

export async function getQuotationById(id: string) {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");
    return await QuotationService.getQuotationById(id);
}

export async function createQuotation(data: CreateSalesQuotationValues) {
    const session = await auth();
    if (!session?.user || !session.user.id) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        await QuotationService.createQuotation(data, session.user.id);
        revalidatePath('/dashboard/sales/quotations');
        return { success: true };
    } catch (error) {
        console.error("Create Quotation Error:", error);
        return { success: false, error: "Failed to create quotation" };
    }
}

export async function updateQuotation(data: UpdateSalesQuotationValues) {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        await QuotationService.updateQuotation(data);
        revalidatePath('/dashboard/sales/quotations');
        revalidatePath(`/dashboard/sales/quotations/${data.id}`);
        return { success: true };
    } catch (error) {
        console.error("Update Quotation Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to update quotation" };
    }
}

export async function deleteQuotation(id: string) {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        await QuotationService.deleteQuotation(id);
        revalidatePath('/dashboard/sales/quotations');
        return { success: true };
    } catch (error) {
        console.error("Delete Quotation Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to delete quotation" };
    }
}

export async function convertToOrder(quotationId: string, sourceLocationId: string) {
    const session = await auth();
    if (!session?.user || !session.user.id) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        const order = await QuotationService.convertToOrder(quotationId, session.user.id, sourceLocationId);
        revalidatePath('/dashboard/sales/quotations');
        revalidatePath('/dashboard/sales');
        return { success: true, orderId: order.id };
    } catch (error) {
        console.error("Convert Quotation Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to convert quotation" };
    }
}
