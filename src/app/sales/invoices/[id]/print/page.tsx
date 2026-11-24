import { getSalesInvoiceForPrint } from '@/actions/finance/invoice-print';
import { InvoiceDotMatrixPrint } from '@/components/finance/invoices/InvoiceDotMatrixPrint';
import { notFound } from 'next/navigation';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';
import { serializeInvoiceForPrint } from '@/lib/finance/serialize-invoice-for-print';
import type { ComponentProps } from 'react';

interface PrintPageProps {
    params: Promise<{ id: string }>;
}

/**
 * Sales-portal invoice print page (PDF via the browser print dialog).
 * Data comes from getSalesInvoiceForPrint, which is limited to the same
 * operational invoices the /sales/invoices list shows.
 */
export default async function SalesInvoicePrintPage({
    params,
}: PrintPageProps) {
    const { id } = await params;
    const [result, companyConfig] = await Promise.all([
        getSalesInvoiceForPrint(id),
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
