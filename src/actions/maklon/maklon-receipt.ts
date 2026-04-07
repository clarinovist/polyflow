'use server';

import { MaklonReceiptService } from '@/services/maklon/maklon-receipt-service';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/tools/auth-checks';

export async function createMaklonReceiptAction(data: {
    receiptNumber: string;
    customerId: string;
    locationId: string;
    notes?: string;
    items: {
        productVariantId: string;
        receivedQty: number;
    }[];
}) {
    try {
        const session = await requireAuth();
        const user = session?.user;
        if (!user) throw new Error('Unauthorized');

        const receipt = await MaklonReceiptService.createReceipt({
            ...data,
            createdById: user.id
        });

        revalidatePath('/dashboard/maklon/receipts');
        revalidatePath('/dashboard/inventory');
        return { success: true, data: receipt };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
