import { getCustomerById } from "@/actions/sales/customer";
import { getSalesOrdersByCustomerId } from "@/actions/sales/sales";
import { notFound } from "next/navigation";
import { CustomerDetailClient } from "@/components/customers/CustomerDetailClient";
import type { SerializedCustomer } from "@/components/customers/CustomerDetailClient";

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
      salesOrders={salesOrders.map((order: any) => ({
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
            } as SerializedCustomer)
          : null,
      }))}
    />
  );
}
