
import { getInvoices } from "@/actions/invoice";
import { InvoiceTable } from "@/components/sales/InvoiceTable";
import { Receipt } from "lucide-react";
import { serializeForClient } from "@/lib/serialize";

export default async function InvoicesPage() {
    const invoices = await getInvoices();

    // Serialize all Prisma objects for Client Components
    const serializedInvoices = serializeForClient(invoices);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Receipt className="h-8 w-8" />
                        Invoices
                    </h1>
                    <p className="text-muted-foreground">
                        Manage and view all generated invoices
                    </p>
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <InvoiceTable invoices={serializedInvoices as any} />
        </div>
    );
}
