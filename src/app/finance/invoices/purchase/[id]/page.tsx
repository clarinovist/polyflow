import { PurchaseService } from '@/services/purchasing/purchase-service';
import { notFound } from 'next/navigation';

import { withTenantPage } from '@/lib/core/tenant';
import { FinancialPurchaseInvoicePageClient } from './page.client';

const getInvoice = withTenantPage(async (id) => {
    return PurchaseService.getPurchaseInvoiceById(id);
});
interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function FinancialPurchaseInvoicePage({ params }: PageProps) {
    const { id } = await params;
    const invoice = await getInvoice(id);

    if (!invoice) {
        notFound();
    }

    return <FinancialPurchaseInvoicePageClient invoice={invoice as never} />;
}
