import { getCustomerById } from "@/actions/sales/customer";
import { getSalesOrdersByCustomerId } from "@/actions/sales/sales";
import { getProductVariants } from "@/actions/inventory/inventory";
import { getCustomerProductPrices } from "@/actions/sales/customer-product-prices";
import { notFound } from "next/navigation";
import { CustomerDetailClient } from "@/components/customers/CustomerDetailClient";
import type { SerializedCustomer } from "@/components/customers/CustomerDetailClient";
import type { ComponentProps } from 'react';

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const [customerRes, salesOrdersRes] = await Promise.all([
    getCustomerById(id),
    getSalesOrdersByCustomerId(id),
  ]);
  const customer =
    customerRes?.success && customerRes.data ? customerRes.data : null;
  const salesOrders =
    salesOrdersRes?.success && salesOrdersRes.data ? salesOrdersRes.data : [];

  if (!customer) {
    notFound();
  }

  const [pricesRes, productsRes] = await Promise.all([
    getCustomerProductPrices(id),
    getProductVariants(),
  ]);
  const prices = pricesRes.success && pricesRes.data ? pricesRes.data : [];
  const products = productsRes.success && productsRes.data ? productsRes.data : [];

  const serializedCustomer = {
    id: customer.id,
    name: customer.name,
    code: customer.code,
    phone: customer.phone,
    email: customer.email,
    billingAddress: customer.billingAddress,
    shippingAddress: customer.shippingAddress,
    taxId: customer.taxId,
    creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
    paymentTermDays: customer.paymentTermDays,
    discountPercent: customer.discountPercent
      ? Number(customer.discountPercent)
      : null,
    notes: customer.notes,
    isActive: customer.isActive,
    latitude: customer.latitude ? Number(customer.latitude) : null,
    longitude: customer.longitude ? Number(customer.longitude) : null,
    photoUrl: customer.photoUrl,
    province: customer.province,
    city: customer.city,
    district: customer.district,
    village: customer.village,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  } satisfies SerializedCustomer;

  return (
    <CustomerDetailClient
      customer={serializedCustomer}
      salesOrders={salesOrders.map((order: typeof salesOrders[number]) => ({
        ...order,
        totalAmount: order.totalAmount ? Number(order.totalAmount) : null,
        customer: order.customer
          ? ({
              ...order.customer,
              creditLimit: order.customer.creditLimit
                ? Number(order.customer.creditLimit)
                : null,
              discountPercent: order.customer.discountPercent
                ? Number(order.customer.discountPercent)
                : null,
              latitude: order.customer.latitude
                ? Number(order.customer.latitude)
                : null,
              longitude: order.customer.longitude
                ? Number(order.customer.longitude)
                : null,
            } as unknown as SerializedCustomer)
          : null,
      })) as unknown as ComponentProps<typeof CustomerDetailClient>['salesOrders']}
      customerProductPrices={prices as unknown as ComponentProps<typeof CustomerDetailClient>['customerProductPrices']}
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
          reorderQuantity: p.reorderQuantity ? Number(p.reorderQuantity) : null,
          standardCost: p.standardCost ? Number(p.standardCost) : null,
        })) as unknown as ComponentProps<typeof CustomerDetailClient>['products']}
    />
  );
}
