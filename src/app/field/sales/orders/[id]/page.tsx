import { getSalesOrderById } from "@/actions/sales/sales";
import { getLocations } from "@/actions/inventory/locations";
import { notFound } from "next/navigation";
import { OrderDetailClient } from "./OrderDetailClient";

type DBOrderWithDeliveries = {
  deliveryOrders?: {
    id: string;
    orderNumber: string;
    deliveryDate: Date;
    status: string;
    trackingNumber: string | null;
    carrier: string | null;
    notes: string | null;
    items: {
      id: string;
      quantity: unknown;
      productVariant: {
        name: string;
        product: {
          name: string;
        };
      };
    }[];
  }[];
};

export default async function SalesMobileOrderDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [response, locationsResponse] = await Promise.all([
    getSalesOrderById(id),
    getLocations(),
  ]);

  if (!response?.success || !response.data) {
    notFound();
  }

  const order = response.data;
  const locations = locationsResponse?.success && locationsResponse.data
    ? locationsResponse.data.map((loc) => ({
        id: loc.id,
        name: loc.name,
      }))
    : [];

  const dbOrder = order as typeof order & DBOrderWithDeliveries;

  const serialized = {
    id: dbOrder.id,
    orderNumber: dbOrder.orderNumber,
    orderDate: String(dbOrder.orderDate),
    status: dbOrder.status,
    totalAmount: dbOrder.totalAmount ? Number(dbOrder.totalAmount) : null,
    discountAmount: dbOrder.discountAmount ? Number(dbOrder.discountAmount) : null,
    taxAmount: dbOrder.taxAmount ? Number(dbOrder.taxAmount) : null,
    shippingCost: dbOrder.shippingCost ? Number(dbOrder.shippingCost) : null,
    notes: dbOrder.notes,
    customer: dbOrder.customer
      ? {
          id: dbOrder.customer.id,
          name: dbOrder.customer.name,
          phone: dbOrder.customer.phone,
          billingAddress: dbOrder.customer.billingAddress,
          latitude: dbOrder.customer.latitude
            ? Number(dbOrder.customer.latitude)
            : null,
          longitude: dbOrder.customer.longitude
            ? Number(dbOrder.customer.longitude)
            : null,
        }
      : null,
    items: dbOrder.items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      productName: item.productVariant.product.name,
      variantName: item.productVariant.name,
      skuCode: item.productVariant.skuCode,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      deliveredQty: Number(item.deliveredQty),
    })),
    deliveryOrders: (dbOrder.deliveryOrders || []).map((doItem) => ({
      id: doItem.id,
      orderNumber: doItem.orderNumber,
      deliveryDate: String(doItem.deliveryDate),
      status: doItem.status,
      trackingNumber: doItem.trackingNumber,
      carrier: doItem.carrier,
      notes: doItem.notes,
      items: (doItem.items || []).map((item) => ({
        id: item.id,
        variantName: item.productVariant?.name || "",
        productName: item.productVariant?.product?.name || "",
        quantity: Number(item.quantity),
      })),
    })),
  };

  return <OrderDetailClient order={serialized} locations={locations} />;
}
