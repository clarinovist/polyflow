'use server';

import { MaklonReceiptService } from '@/services/maklon/maklon-receipt-service';
import { revalidatePath } from 'next/cache';
import { requireAuth } from "@/lib/tools/auth-checks";
import { AuthenticationError } from "@/lib/errors/errors";
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';

export const createMaklonReceiptAction = withTenant(async function createMaklonReceiptAction(data: {
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
        if (!user) throw new AuthenticationError();

        const receipt = await MaklonReceiptService.createReceipt({
            ...data,
            createdById: user.id
        });

        revalidatePath('/maklon/receipts');
        revalidatePath('/dashboard/maklon/receipts');
        revalidatePath('/warehouse/maklon/receipts');
        revalidatePath('/dashboard/inventory');
        return { success: true, data: receipt };
    } catch {
        return { success: false, error: 'Gagal memproses penerimaan Maklon' };
    }
});

export const getMaklonReceipt = withTenant(async function getMaklonReceipt(id: string) {
    if (!id) return null;

    const receipt = await prisma.goodsReceipt.findUnique({
        where: { id },
        include: {
            items: {
                include: {
                    productVariant: {
                        include: {
                            product: { select: { id: true, name: true, productType: true } }
                        }
                    }
                },
                orderBy: { id: 'asc' }
            },
            customer: true,
            location: true,
            createdBy: { select: { id: true, name: true } },
        },
    });

    if (!receipt || !receipt.isMaklon) return null;

    return serializeData(receipt);
});
