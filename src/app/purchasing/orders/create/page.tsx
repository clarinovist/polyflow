import React from 'react';
import { getSuppliers } from '@/actions/purchasing/supplier';
import { getProductVariants } from '@/actions/inventory/inventory';
import { PurchaseOrderForm } from '@/components/purchasing/orders/PurchaseOrderForm';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Buat Purchase Order Baru',
};

type ProductVariantWithProduct = {
    id: string;
    name: string;
    skuCode: string;
    buyPrice?: { toNumber?: () => number } | number | null;
    product?: { productType?: string; assetCategory?: string | null } | null;
    productType?: string;
    assetCategory?: string | null;
};

export default async function CreatePurchaseOrderPage({ searchParams }: { searchParams?: Promise<{ variantId?: string | string[] }> }) {
    const query = await searchParams;
    const requestedVariantId = typeof query?.variantId === 'string' ? query.variantId : undefined;
    const [suppliersRes, productsRes] = await Promise.all([
        getSuppliers(),
        getProductVariants(),
    ]);

    const suppliers =
        suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];
    const products =
        productsRes.success && productsRes.data
            ? (productsRes.data as ProductVariantWithProduct[])
            : [];

    const formattedProducts = products.map((p) => ({
        ...p,
        buyPrice:
            p.buyPrice &&
            typeof p.buyPrice === 'object' &&
            'toNumber' in p.buyPrice
                ? (p.buyPrice as { toNumber: () => number }).toNumber()
                : Number(p.buyPrice || 0),
        productType: p.product?.productType || p.productType,
        assetCategory: p.product?.assetCategory || null,
    }));

    const initialProductVariantId = formattedProducts.some((product) => product.id === requestedVariantId) ? requestedVariantId : undefined;
    const formattedSuppliers = suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        paymentTermDays: s.paymentTermDays,
    }));

    return (
        <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShoppingCart className="h-3 w-3" />
                    <span>Procurement / Purchase Orders / New</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Create Purchase Order
                </h1>
                <p className="text-muted-foreground">
                    Draft a new order to send to your supplier.
                </p>
            </div>

            {requestedVariantId && !initialProductVariantId && <p role="alert" className="rounded-lg border p-4 text-sm">Bahan dari MRP tidak tersedia dalam pilihan pembelian. Pilih bahan yang benar secara manual.</p>}
            {initialProductVariantId && <p className="rounded-lg border p-4 text-sm">Bahan dari MRP sudah dipilih. Periksa jumlah, harga, dan pemasok sebelum menyimpan PO; belum ada transaksi dibuat.</p>}
            <PurchaseOrderForm
                initialProductVariantId={initialProductVariantId}
                suppliers={formattedSuppliers}
                productVariants={formattedProducts}
            />
        </div>
    );
}
