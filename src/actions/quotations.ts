'use server';
import { QuotationService } from '@/services/quotation-service';
import { CreateSalesQuotationValues, UpdateSalesQuotationValues } from '@/lib/schemas/quotation';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { catchError } from '@/lib/error-handler';
import { requireAuth } from '@/lib/auth-checks';


export async function getQuotations(dateRange?: { startDate?: Date, endDate?: Date }) {
    await requireAuth();
    const quotations = await QuotationService.getQuotations(dateRange);
    return serializeData(quotations);
}

export async function getQuotationById(id: string) {
    await requireAuth();
    const quotation = await QuotationService.getQuotationById(id);
    return serializeData(quotation);
}

export async function createQuotation(data: CreateSalesQuotationValues) {
    const session = await requireAuth();
    return catchError(async () => {
        const quotation = await QuotationService.createQuotation(data, session.user.id);
        revalidatePath('/sales/quotations');
        return quotation;
    });
}

export async function updateQuotation(data: UpdateSalesQuotationValues) {
    await requireAuth();
    return catchError(async () => {
        await QuotationService.updateQuotation(data);
        revalidatePath('/sales/quotations');
        revalidatePath(`/sales/quotations/${data.id}`);
        return { id: data.id };
    });
}

export async function deleteQuotation(id: string) {
    await requireAuth();
    return catchError(async () => {
        await QuotationService.deleteQuotation(id);
        revalidatePath('/sales/quotations');
        return true;
    });
}

export async function convertToOrder(quotationId: string, sourceLocationId: string) {
    const session = await requireAuth();
    return catchError(async () => {
        const order = await QuotationService.convertToOrder(quotationId, session.user.id, sourceLocationId);
        revalidatePath('/sales/quotations');
        revalidatePath('/sales');
        return order;
    });
}
