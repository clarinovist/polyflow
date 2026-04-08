'use server';

import { MaklonReturnService } from '@/services/maklon/maklon-return-service';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/tools/auth-checks';

export async function createMaklonReturnAction(data: {
    returnNumber: string;
    customerId: string;
    sourceLocationId: string;
    reason?: string;
    notes?: string;
    items: {
        productVariantId: string;
        quantity: number;
        notes?: string;
    }[];
}) {
    try {
        const session = await requireAuth();
        const user = session?.user;
        if (!user) throw new Error('Unauthorized');

        const ret = await MaklonReturnService.createReturn({
            ...data,
            createdById: user.id
        });

        revalidatePath('/dashboard/maklon/returns');
        revalidatePath('/dashboard/inventory');
        return { success: true, data: ret };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getMaklonReturnsAction(params?: {
    search?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
}) {
    try {
        const session = await requireAuth();
        if (!session?.user) throw new Error('Unauthorized');
        
        const returns = await MaklonReturnService.getReturns(params);
        return { success: true, data: returns };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getMaklonReturnByIdAction(id: string) {
    try {
        const session = await requireAuth();
        if (!session?.user) throw new Error('Unauthorized');
        
        const ret = await MaklonReturnService.getReturnById(id);
        if (!ret) throw new Error('Return not found');
        return { success: true, data: ret };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
