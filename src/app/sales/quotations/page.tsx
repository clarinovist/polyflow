import { redirect } from 'next/navigation';

/**
 * /sales/quotations → unified SO list with quotation filter.
 * Legacy quotation module is absorbed into Sales Order lifecycle.
 */
export default async function SalesQuotationsPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams();
    q.set('status', 'QUOTATION,QUOTATION_SENT');
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    redirect(`/sales/orders?${q.toString()}`);
}
