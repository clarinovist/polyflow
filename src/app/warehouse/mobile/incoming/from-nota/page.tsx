import React from 'react';
import { prisma } from '@/lib/core/prisma';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { MobileWalkInReceiptForm } from '@/components/warehouse/mobile/MobileWalkInReceiptForm';

const getData = withTenantPage(async () => {
    const [suppliers, locations, productVariants] = await Promise.all([
        prisma.supplier.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, code: true },
        }),
        prisma.location.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        }),
        prisma.productVariant.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                skuCode: true,
                primaryUnit: true,
                standardCost: true,
            },
        }),
    ]);
    return { suppliers, locations, productVariants };
});

export const metadata: Metadata = {
    title: 'Terima dari Nota | Mobile | PolyFlow',
};

export default async function MobileFromNotaPage() {
    const data = await getData();

    return (
        <div className="p-4 space-y-4">
            <MobileWalkInReceiptForm
                suppliers={serializeData(data.suppliers)}
                locations={serializeData(data.locations)}
                productVariants={serializeData(data.productVariants)}
            />
        </div>
    );
}
