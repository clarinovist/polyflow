'use server';

import { MaklonCostService } from '@/services/maklon/maklon-cost-service';
import { revalidatePath } from 'next/cache';

export async function addMaklonCostAction(data: {
    productionOrderId: string;
    costType: 'LABOR' | 'MACHINE' | 'ELECTRICITY' | 'ADDITIVE' | 'COLORANT' | 'OVERHEAD' | 'OTHER';
    amount: number;
    description?: string;
}) {
    try {
        await MaklonCostService.addCostItem(data);
        await MaklonCostService.updateEstimatedConversionCost(data.productionOrderId);
        
        revalidatePath(`/dashboard/production/${data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function removeMaklonCostAction(id: string, productionOrderId: string) {
    try {
        await MaklonCostService.removeCostItem(id);
        await MaklonCostService.updateEstimatedConversionCost(productionOrderId);

        revalidatePath(`/dashboard/production/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
