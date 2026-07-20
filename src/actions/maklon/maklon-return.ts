'use server';

import { MaklonReturnService } from '@/services/maklon/maklon-return-service';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/tools/auth-checks';
import { AuthenticationError, NotFoundError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';

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
        if (!user) throw new AuthenticationError();

        const ret = await MaklonReturnService.createReturn({
            ...data,
            createdById: user.id
        });

        revalidatePath('/maklon/returns');
        revalidatePath('/dashboard/maklon/returns');
        revalidatePath('/warehouse/maklon/returns');
        revalidatePath('/dashboard/inventory');
        return { success: true, data: serializeData(ret) };
    } catch {
        return { success: false, error: 'Gagal memproses retur Maklon' };
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
        if (!session?.user) throw new AuthenticationError();
        
        const returns = await MaklonReturnService.getReturns(params);
        return { success: true, data: serializeData(returns) };
    } catch {
        return { success: false, error: 'Gagal memproses retur Maklon' };
    }
}

export async function getMaklonReturnByIdAction(id: string) {
    try {
        const session = await requireAuth();
        if (!session?.user) throw new AuthenticationError();
        
        const ret = await MaklonReturnService.getReturnById(id);
        if (!ret) throw new NotFoundError('Maklon Return', id);
        return { success: true, data: serializeData(ret) };
    } catch {
        return { success: false, error: 'Gagal memproses retur Maklon' };
    }
}
