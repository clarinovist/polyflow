
import { getInvoiceById } from "@/actions/invoice";
import { InvoiceDetailClient } from "@/components/sales/InvoiceDetailClient";
import { notFound } from "next/navigation";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch invoice with all required relations
    // getInvoiceById already includes deep relations needed for the client component
    const invoice = await getInvoiceById(id);

    if (!invoice) {
        notFound();
    }

    return (
        <div className="p-6">
            <InvoiceDetailClient invoice={{
                ...invoice,
                totalAmount: Number(invoice.totalAmount),
                paidAmount: Number(invoice.paidAmount),
                salesOrder: {
                    ...invoice.salesOrder,
                    totalAmount: invoice.salesOrder.totalAmount ? Number(invoice.salesOrder.totalAmount) : null,
                    customer: invoice.salesOrder.customer ? {
                        ...invoice.salesOrder.customer,
                        creditLimit: invoice.salesOrder.customer.creditLimit ? Number(invoice.salesOrder.customer.creditLimit) : null,
                        discountPercent: invoice.salesOrder.customer.discountPercent ? Number(invoice.salesOrder.customer.discountPercent) : null
                    } : null,
                    items: invoice.salesOrder.items.map((item) => ({
                        ...item,
                        quantity: Number(item.quantity),
                        unitPrice: Number(item.unitPrice),
                        subtotal: Number(item.subtotal)
                    }))
                }
            }} />
        </div>
    );
}
