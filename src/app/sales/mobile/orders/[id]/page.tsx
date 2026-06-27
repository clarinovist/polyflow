import { getSalesOrderById } from "@/actions/sales/sales";
import { notFound } from "next/navigation";
import { OrderDetailClient } from "./OrderDetailClient";

export default async function SalesMobileOrderDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const response = await getSalesOrderById(id);

  if (!response?.success || !response.data) {
    notFound();
  }

  const order = response.data;

  const serialized = {
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: String(order.orderDate),
    status: order.status,
    totalAmount: order.totalAmount ? Number(order.totalAmount) : null,
    discountAmount: order.discountAmount ? Number(order.discountAmount) : null,
    taxAmount: order.taxAmount ? Number(order.taxAmount) : null,
    shippingCost: order.shippingCost ? Number(order.shippingCost) : null,
    notes: order.notes,
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          phone: order.customer.phone,
          billingAddress: order.customer.billingAddress,
          latitude: order.customer.latitude
            ? Number(order.customer.latitude)
            : null,
          longitude: order.customer.longitude
            ? Number(order.customer.longitude)
            : null,
        }
      : null,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productVariant.product.name,
      variantName: item.productVariant.name,
      skuCode: item.productVariant.skuCode,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      deliveredQty: Number(item.deliveredQty),
    })),
  };

  return <OrderDetailClient order={serialized} />;
}
