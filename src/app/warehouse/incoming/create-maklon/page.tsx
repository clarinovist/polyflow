import React from 'react';
import { prisma } from '@/lib/core/prisma';
import { MaklonGoodsReceiptForm } from '@/components/planning/purchasing/MaklonGoodsReceiptForm';
import { Metadata } from 'next';
import { Package } from 'lucide-react';
import { serializeData } from '@/lib/utils/utils';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Receive Maklon Goods | Warehouse | PolyFlow',
};

export default async function CreateMaklonReceiptPage() {
    // 1. Fetch Master Data Needed for Maklon
    const customers = await prisma.customer.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });

    const locations = await prisma.location.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });

    const productVariants = await prisma.productVariant.findMany({
        include: {
            product: true
        },
        orderBy: { skuCode: 'asc' }
    });

    // 2. Format product variants for the form
    const formattedVariants = productVariants.map((v: { id: string, skuCode: string, product: { name: string } }) => ({
        id: v.id,
        name: v.product.name,
        skuCode: v.skuCode,
    }));

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Link href="/warehouse/incoming" className="hover:text-primary transition-colors">Warehouse / Incoming</Link>
                    <span>/</span>
                    <Package className="h-3 w-3" />
                    <span>Receive Maklon</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Receive Maklon Goods</h1>
                <p className="text-muted-foreground">Register raw materials and items supplied by customers for maklon orders.</p>
            </div>

            <MaklonGoodsReceiptForm
                customers={serializeData(customers)}
                productVariants={serializeData(formattedVariants)}
                locations={serializeData(locations)}
                defaultLocationId={locations[0]?.id}
                basePath="/warehouse/incoming"
            />
        </div>
    );
}
