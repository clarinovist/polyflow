import { redirect, notFound } from 'next/navigation';
import { resolveQuotationOrderId } from '@/actions/sales/sales';

/**
 * /sales/quotations/[id]/edit → edit SO terpadu.
 *
 * Sama seperti route detail: id legacy dipetakan dulu ke SalesOrder.
 */
export default async function QuotationEditRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const res = await resolveQuotationOrderId(id);
    const orderId = res.success ? res.data : null;

    if (!orderId) notFound();
    redirect(`/sales/orders/${orderId}/edit`);
}
