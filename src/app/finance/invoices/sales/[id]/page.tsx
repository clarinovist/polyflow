import { getInvoiceById } from "@/actions/invoice";
import { FinancialInvoiceDetail } from "@/components/finance/invoices/FinancialInvoiceDetail";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function FinancialInvoicePage({ params }: PageProps) {
    const { id } = await params;
    const invoice = await getInvoiceById(id);

    if (!invoice) {
        notFound();
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/finance/invoices/sales">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to List
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Invoice Detail</h1>
                    <p className="text-sm text-muted-foreground">Financial View</p>
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <FinancialInvoiceDetail invoice={invoice as any} />
        </div>
    );
}
