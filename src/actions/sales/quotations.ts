'use server';

import { withTenant } from "@/lib/core/tenant";
import { QuotationService } from '@/services/sales/quotation-service';
import { CreateSalesQuotationValues, UpdateSalesQuotationValues } from '@/lib/schemas/quotation';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';


export const getQuotations = withTenant(
async function getQuotations(dateRange?: { startDate?: Date, endDate?: Date }) {
    return safeAction(async () => {
        await requireAuth();
        const quotations = await QuotationService.getQuotations(dateRange);
        return serializeData(quotations);
    });
}
);

export const getQuotationById = withTenant(
async function getQuotationById(id: string) {
    return safeAction(async () => {
        await requireAuth();
        const quotation = await QuotationService.getQuotationById(id);
        return serializeData(quotation);
    });
}
);

export const createQuotation = withTenant(
async function createQuotation(data: CreateSalesQuotationValues) {
    return safeAction(async () => {
        const session = await requireAuth();
        const quotation = await QuotationService.createQuotation(data, session.user.id);
        revalidatePath('/sales/quotations');
        return quotation;
    });
}
);

export const updateQuotation = withTenant(
async function updateQuotation(data: UpdateSalesQuotationValues) {
    return safeAction(async () => {
        await requireAuth();
        await QuotationService.updateQuotation(data);
        revalidatePath('/sales/quotations');
        revalidatePath(`/sales/quotations/${data.id}`);
        return { id: data.id };
    });
}
);

export const deleteQuotation = withTenant(
async function deleteQuotation(id: string) {
    return safeAction(async () => {
        await requireAuth();
        await QuotationService.deleteQuotation(id);
        revalidatePath('/sales/quotations');
        return true;
    });
}
);

export const convertToOrder = withTenant(
async function convertToOrder(quotationId: string, sourceLocationId: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const order = await QuotationService.convertToOrder(quotationId, session.user.id, sourceLocationId);
        revalidatePath('/sales/quotations');
        revalidatePath('/sales');
        return order;
    });
}
);
