import { PurchaseService } from '@/services/purchase-service';
import { notFound } from 'next/navigation';
import { PurchaseInvoiceDetailClient } from '@/components/purchasing/PurchaseInvoiceDetailClient';
import { Metadata } from 'next';
import { serializeForClient } from '@/lib/serialize';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const invoice = await PurchaseService.getPurchaseInvoiceById(id);
    return {
        title: invoice ? `${invoice.invoiceNumber} | PolyFlow` : 'Invoice Not Found',
    };
}

export default async function PurchaseInvoiceDetailPage({ params }: PageProps) {
    const { id } = await params;
    const invoice = await PurchaseService.getPurchaseInvoiceById(id);

    if (!invoice) {
        notFound();
    }

    // Serialize and convert Decimal values to numbers
    const serializedInvoice = {
        ...serializeForClient(invoice),
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
        purchaseOrder: {
            ...invoice.purchaseOrder,
            totalAmount: Number(invoice.purchaseOrder.totalAmount)
        },
        payments: invoice.payments.map(p => ({
            ...p,
            amount: Number(p.amount),
            paymentDate: p.paymentDate.toISOString()
        }))
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseInvoiceDetailClient invoice={serializedInvoice as any} />
        </div>
    );
}
