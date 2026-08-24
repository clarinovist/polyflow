'use server';import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
export const getMaklonReceipt = withTenant(async function getMaklonReceipt(
    id: string,
) {
    if (!id) return null;

    const receipt = await prisma.goodsReceipt.findUnique({
        where: { id },
        include: {
            items: {
                include: {
                    productVariant: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    productType: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { id: 'asc' },
            },
            customer: true,
            location: true,
            createdBy: { select: { id: true, name: true } },
        },
    });

    if (!receipt || !receipt.isMaklon) return null;

    return serializeData(receipt);
});
