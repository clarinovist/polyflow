import { PurchaseService } from '@/services/purchase-service';
import { notFound } from 'next/navigation';
import { FinancialPurchaseInvoiceDetail } from '@/components/finance/invoices/FinancialPurchaseInvoiceDetail';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function FinancialPurchaseInvoicePage({ params }: PageProps) {
    const { id } = await params;
    const invoice = await PurchaseService.getPurchaseInvoiceById(id);

    if (!invoice) {
        notFound();
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/finance/invoices/purchase">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to List
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Purchase Invoice Detail</h1>
                    <p className="text-sm text-muted-foreground">Financial View</p>
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <FinancialPurchaseInvoiceDetail invoice={invoice as any} />
        </div>
    );
}
