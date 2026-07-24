import React from "react";
import { getPurchaseOrderById } from "@/actions/purchasing/purchasing";
import { getSuppliers } from "@/actions/purchasing/supplier";
import { getProductVariants } from "@/actions/inventory/inventory";
import { PurchaseOrderForm } from "@/components/purchasing/orders/PurchaseOrderForm";
import { notFound } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Purchase Order",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

type ProductVariantWithProduct = {
  id: string;
  name: string;
  skuCode: string;
  buyPrice?: { toNumber?: () => number } | number | null;
  product?: { productType?: string; assetCategory?: string | null } | null;
  productType?: string;
  assetCategory?: string | null;
};

export default async function EditPurchaseOrderPage({ params }: PageProps) {
  const { id } = await params;

  const [orderRes, suppliersRes, productsRes] = await Promise.all([
    getPurchaseOrderById(id),
    getSuppliers(),
    getProductVariants(),
  ]);

  const order =
    orderRes.success && orderRes.data ? orderRes.data : null;
  const suppliers =
    suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];
  const products =
    productsRes.success && productsRes.data ? (productsRes.data as ProductVariantWithProduct[]) : [];

  if (!order) {
    notFound();
  }

  const formattedProducts = products.map((p) => ({
    ...p,
    buyPrice: p.buyPrice && typeof p.buyPrice === 'object' && 'toNumber' in p.buyPrice ? (p.buyPrice as { toNumber: () => number }).toNumber() : Number(p.buyPrice || 0),
    productType: p.product?.productType || p.productType,
    assetCategory: p.product?.assetCategory || null,
  }));

  const formattedSuppliers = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    paymentTermDays: s.paymentTermDays,
  }));

  const initialData = {
    id: order.id,
    supplierId: order.supplierId,
    orderDate: order.orderDate,
    expectedDate: order.expectedDate,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    shippingCost: order.shippingCost ? Number(order.shippingCost) : 0,
    items: order.items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountPercent: item.discountPercent
        ? Number(item.discountPercent)
        : 0,
      taxPercent: item.taxPercent ? Number(item.taxPercent) : 0,
      dppOtherAmount: item.dppOtherAmount ? Number(item.dppOtherAmount) : null,
    })),
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShoppingCart className="h-3 w-3" />
          <span>Procurement / Purchase Orders / Edit</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Edit {order.orderNumber}
        </h1>
        <p className="text-muted-foreground">
          Koreksi harga, qty, atau detail lainnya pada purchase order ini.
        </p>
      </div>

      <PurchaseOrderForm
        suppliers={formattedSuppliers}
        productVariants={formattedProducts}
        mode="edit"
        initialData={initialData}
      />
    </div>
  );
}
