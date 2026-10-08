import { getInvoiceById } from '@/actions/finance/invoice';
import { FinancialInvoiceDetail } from '@/components/finance/invoices/FinancialInvoiceDetail';
import { notFound } from 'next/navigation';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';
import type { ComponentProps } from 'react';
import { auth } from '@/auth';
import { hasRole } from '@/lib/auth/roles';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function FinancialInvoicePage({ params }: PageProps) {
    const { id } = await params;
    const [invoiceResult, companyConfig, session] = await Promise.all([
        getInvoiceById(id),
        getCompanyConfigWithOverridesAsync(),
        auth(),
    ]);

    if (!invoiceResult.success) {
        throw new Error(invoiceResult.error);
    }

    const invoice =
        invoiceResult.data as unknown as (typeof invoiceResult)['data'] extends infer D
            ? D
            : never;

    if (!invoice) {
        notFound();
    }

    return (
        <div className="space-y-6 p-6">
            <FinancialInvoiceDetail
                invoice={
                    invoice as unknown as ComponentProps<
                        typeof FinancialInvoiceDetail
                    >['invoice']
                }
                companyConfig={companyConfig}
                basePath="/finance/invoices/sales"
                canEditInvoiceDate={hasRole(session?.user, 'ADMIN')}
            />
        </div>
    );
}
