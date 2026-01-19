
import { getInvoices } from "@/actions/invoice";
import { InvoiceTable } from "@/components/sales/InvoiceTable";
import { Receipt } from "lucide-react";

export default async function InvoicesPage() {
    const invoices = await getInvoices();

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

            <InvoiceTable invoices={invoices.map(inv => ({
                ...inv,
                totalAmount: Number(inv.totalAmount),
                paidAmount: Number(inv.paidAmount) || 0
            }))} />
        </div>
    );
}
