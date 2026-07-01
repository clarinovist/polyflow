import { getOutstandingInvoices } from "@/actions/finance/invoice";
import { ReceivablesListClient } from "./ReceivablesListClient";

export default async function SalesMobileReceivablesPage() {
  const invoicesRes = await getOutstandingInvoices();
  const invoices = invoicesRes.success && invoicesRes.data ? invoicesRes.data : [];

  const serialized = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    totalAmount: Number(inv.totalAmount),
    paidAmount: Number(inv.paidAmount),
    status: inv.status,
    customerName: inv.salesOrder?.customer?.name || "Customer Umum",
    orderNumber: inv.salesOrder?.orderNumber || "",
  }));

  return <ReceivablesListClient invoices={serialized} />;
}
