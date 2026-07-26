import { redirect, notFound } from 'next/navigation';
import { resolveQuotationOrderId } from '@/actions/sales/sales';

/**
 * /sales/quotations/[id] → detail SO terpadu.
 *
 * Id pada tautan lama bisa berupa id SalesQuotation legacy, jadi dipetakan
 * dulu ke SalesOrder hasil migrasi sebelum diarahkan.
 */
export default async function QuotationDetailRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const res = await resolveQuotationOrderId(id);
    const orderId = res.success ? res.data : null;

    if (!orderId) notFound();
    redirect(`/sales/orders/${orderId}`);
}
