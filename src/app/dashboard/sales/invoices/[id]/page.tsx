
import { getInvoiceById } from "@/actions/invoice";
import { InvoiceDetailClient } from "@/components/sales/InvoiceDetailClient";
import { notFound } from "next/navigation";
import { serializeForClient } from "@/lib/serialize";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const invoice = await getInvoiceById(id);

    if (!invoice) {
        notFound();
    }

    // Serialize all Prisma objects for Client Components
    const serializedInvoice = serializeForClient(invoice);

    return (
        <div className="p-6">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <InvoiceDetailClient invoice={serializedInvoice as any} />
        </div>
    );
}
