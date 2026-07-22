import React from 'react';
import { prisma } from '@/lib/core/prisma';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { WalkInReceiptForm } from '@/components/warehouse/incoming/WalkInReceiptForm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const getData = withTenantPage(async () => {
    const [suppliers, locations, productVariants] = await Promise.all([
        prisma.supplier.findMany({
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
    title: 'Terima dari Nota | Warehouse | PolyFlow',
};

export default async function FromNotaPage() {
    const data = await getData();

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex flex-col gap-2 mb-6">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/warehouse/incoming">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Kembali
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Terima dari Nota
                    </h1>
                </div>
                <p className="text-muted-foreground">
                    Catat penerimaan barang dari nota/surat jalan. PO akan dibuat
                    otomatis — stok langsung bertambah tanpa menunggu finance.
                </p>
            </div>
            <WalkInReceiptForm
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                suppliers={serializeData(data.suppliers) as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                locations={serializeData(data.locations) as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                productVariants={serializeData(data.productVariants) as any}
            />
        </div>
    );
}
