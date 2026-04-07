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
