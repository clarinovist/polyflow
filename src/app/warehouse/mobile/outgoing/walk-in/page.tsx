import React from 'react';
import { prisma } from '@/lib/core/prisma';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { MobileWalkInDispatchForm } from '@/components/warehouse/mobile/MobileWalkInDispatchForm';

const getData = withTenantPage(async () => {
    const [customers, locations, productVariants] = await Promise.all([
        prisma.customer.findMany({
            where: { lifecycleStatus: 'ACTIVE' },
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
                sellPrice: true,
                price: true,
            },
        }),
    ]);
    return { customers, locations, productVariants };
});

export const metadata: Metadata = {
    title: 'Muat Pesanan Dadakan | Mobile | PolyFlow',
};

export default async function MobileWalkInDispatchPage() {
    const data = await getData();

    return (
        <div className="p-4 space-y-4">
            <MobileWalkInDispatchForm
                customers={serializeData(data.customers)}
                locations={serializeData(data.locations)}
                productVariants={serializeData(data.productVariants)}
            />
        </div>
    );
}
