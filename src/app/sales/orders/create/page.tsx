import { getCustomers } from "@/actions/sales/customer";
import { getLocations } from "@/actions/inventory/inventory";
import { getProductVariants } from "@/actions/inventory/inventory";
import { getSalesOrderById } from "@/actions/sales/sales";
import { SalesOrderForm } from "@/components/sales/SalesOrderForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SalesOrderFormProps } from "@/components/sales/sales-order-types";

interface CreateSalesOrderPageProps {
  searchParams: Promise<{ reorder?: string }>;
}

export default async function CreateSalesOrderPage({
  searchParams,
}: CreateSalesOrderPageProps) {
  const params = await searchParams;
  const [customersRes, locationsRes, productsRes] = await Promise.all([
    getCustomers(),
    getLocations(),
    getProductVariants(),
  ]);

  const customers =
    customersRes.success && customersRes.data ? customersRes.data : [];
  const locations =
    locationsRes.success && locationsRes.data ? locationsRes.data : [];
  const products =
    productsRes.success && productsRes.data ? productsRes.data : [];

  // Fetch reorder source order if reorder param is present
  let reorderData: SalesOrderFormProps["reorderData"] | null = null;
  if (params.reorder) {
    const orderRes = await getSalesOrderById(params.reorder);
    if (orderRes.success && orderRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = orderRes.data as any;
      reorderData = {
        customerId: o.customerId || "",
        sourceLocationId: o.sourceLocationId || "",
        orderType: o.orderType || "MAKE_TO_STOCK",
        notes: o.notes || "",
        shippingCost: Number(o.shippingCost) || 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (o.items || []).map((item: any) => ({
          productVariantId: item.productVariantId,
          quantity: Number(item.enteredQuantity) || Number(item.quantity) || 1,
          unitPrice:
            Number(item.enteredUnitPrice) || Number(item.unitPrice) || 0,
          discountPercent: Number(item.discountPercent) || 0,
          taxPercent: Number(item.taxPercent) || 0,
        })),
      };
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>
            {reorderData
              ? "Pesan Ulang dari Order Sebelumnya"
              : "Buat Sales Order Baru"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalesOrderForm
            customers={customers.map((c) => ({
              ...c,
              creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
              discountPercent: c.discountPercent
                ? Number(c.discountPercent)
                : null,
            }))}
            locations={locations}
            products={products
              .filter(
                (p) =>
                  p.product.productType === "FINISHED_GOOD" ||
                  p.product.productType === "SCRAP" ||
                  p.product.productType === "PACKAGING" ||
                  p.product.productType === "SERVICE",
              )
              .map((p) => ({
                ...p,
                price: p.price ? Number(p.price) : null,
                buyPrice: p.buyPrice ? Number(p.buyPrice) : null,
                sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
                conversionFactor: Number(p.conversionFactor),
                minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
                reorderPoint: p.reorderPoint ? Number(p.reorderPoint) : null,
                reorderQuantity: p.reorderQuantity
                  ? Number(p.reorderQuantity)
                  : null,
                standardCost: p.standardCost ? Number(p.standardCost) : null,
                customerPrices:
                  p.customerPrices?.map((price) => ({
                    customerId: price.customerId,
                    unitPrice: Number(price.unitPrice),
                    isActive: price.isActive,
                  })) || [],
                inventories:
                  p.inventories?.map((inv) => ({
                    locationId: inv.locationId,
                    quantity: Number(inv.quantity),
                  })) || [],
              }))}
            mode="create"
            reorderData={reorderData || undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
