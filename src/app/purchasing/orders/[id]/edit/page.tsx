import React from "react";
import { prisma } from "@/lib/core/prisma";
import { PurchaseOrderForm } from "@/components/purchasing/orders/PurchaseOrderForm";
import { notFound } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Purchase Order | PolyFlow",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditPurchaseOrderPage({ params }: PageProps) {
  const { id } = await params;

  const [order, suppliers, products] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    }),
    prisma.supplier.findMany({
      select: { id: true, name: true, code: true },
    }),
    prisma.productVariant.findMany({
      select: { id: true, name: true, skuCode: true, buyPrice: true },
    }),
  ]);

  if (!order) {
    notFound();
  }

  const formattedProducts = products.map((p) => ({
    ...p,
    buyPrice: p.buyPrice ? Number(p.buyPrice) : 0,
  }));

  const initialData = {
    id: order.id,
    supplierId: order.supplierId,
    orderDate: order.orderDate,
    expectedDate: order.expectedDate,
    notes: order.notes,
    shippingCost: order.shippingCost ? Number(order.shippingCost) : 0,
    items: order.items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountPercent: item.discountPercent ? Number(item.discountPercent) : 0,
      taxPercent: item.taxPercent ? Number(item.taxPercent) : 0,
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
        suppliers={suppliers}
        productVariants={formattedProducts}
        mode="edit"
        initialData={initialData}
      />
    </div>
  );
}
