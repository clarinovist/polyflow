import { getInvoiceById } from '@/actions/finance/invoice';
import { InvoiceDotMatrixPrint } from '@/components/finance/invoices/InvoiceDotMatrixPrint';
import { notFound } from 'next/navigation';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';
import { serializeInvoiceForPrint } from '@/lib/finance/serialize-invoice-for-print';
import type { ComponentProps } from 'react';

interface PrintPageProps {
    params: Promise<{ id: string }>;
}

export default async function InvoicePrintPage({ params }: PrintPageProps) {
    const { id } = await params;
    const [result, companyConfig] = await Promise.all([
        getInvoiceById(id),
        getCompanyConfigWithOverridesAsync(),
    ]);

    if (!result.success) {
        throw new Error(result.error);
    }

    const raw = result.data;
    if (!raw) {
        notFound();
    }

    const invoice = serializeInvoiceForPrint(raw);

    return (
        <InvoiceDotMatrixPrint
            invoice={
                invoice as unknown as ComponentProps<
                    typeof InvoiceDotMatrixPrint
                >['invoice']
            }
            invoiceId={id}
            showButton={true}
            companyConfig={companyConfig}
        />
    );
}
