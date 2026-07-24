import { getCustomerById } from "@/actions/sales/customer";
import { getSalesOrdersByCustomerId } from "@/actions/sales/sales";
import { getOutstandingInvoicesByCustomerId } from "@/actions/finance/invoice";
import { notFound } from "next/navigation";
import { CustomerDetailClient } from "./CustomerDetailClient";

export default async function SalesMobileCustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const [customerRes, ordersRes, invoicesRes] = await Promise.all([
    getCustomerById(id),
    getSalesOrdersByCustomerId(id),
    getOutstandingInvoicesByCustomerId(id),
  ]);

  const customer =
    customerRes?.success && customerRes.data ? customerRes.data : null;
  const orders = ordersRes?.success && ordersRes.data ? ordersRes.data : [];
  const invoices = invoicesRes?.success && invoicesRes.data ? invoicesRes.data : [];

  if (!customer) {
    notFound();
  }

  return (
    <CustomerDetailClient
      customer={{
        id: customer.id,
        name: customer.name,
        code: customer.code,
        phone: customer.phone,
        email: customer.email,
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddress,
        creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
        paymentTermDays: customer.paymentTermDays,
        latitude: customer.latitude ? Number(customer.latitude) : null,
        longitude: customer.longitude ? Number(customer.longitude) : null,
        photoUrl: customer.photoUrl,
        province: customer.province,
        city: customer.city,
        district: customer.district,
        village: customer.village,
        isActive: customer.isActive,
      }}
      recentOrders={orders.slice(0, 5).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
        status: o.status,
        orderDate: o.orderDate,
      }))}
      outstandingInvoices={invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        status: inv.status,
        orderNumber: inv.salesOrder?.orderNumber || "",
      }))}
    />
  );
}
