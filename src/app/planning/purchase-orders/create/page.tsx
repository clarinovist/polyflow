import React from 'react';
import { prisma } from '@/lib/prisma';
import { PurchaseOrderForm } from '@/components/planning/purchasing/PurchaseOrderForm';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';

export const metadata: Metadata = {
    title: 'New Purchase Order | PolyFlow',
};

export default async function CreatePurchaseOrderPage() {
    const [suppliers, products] = await Promise.all([
        prisma.supplier.findMany({
            select: { id: true, name: true, code: true }
        }),
        prisma.productVariant.findMany({
            select: { id: true, name: true, skuCode: true, buyPrice: true }
        })
    ]);

    // Format buyPrice (Decimal -> number)
    const formattedProducts = products.map(p => ({
        ...p,
        buyPrice: p.buyPrice ? Number(p.buyPrice) : 0
    }));

    return (
        <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShoppingCart className="h-3 w-3" />
                    <span>Procurement / Purchase Orders / New</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Create Purchase Order</h1>
                <p className="text-muted-foreground">
                    Draft a new order to send to your supplier.
                </p>
            </div>

            <PurchaseOrderForm
                suppliers={suppliers}
                productVariants={formattedProducts}
            />
        </div>
    );
}
