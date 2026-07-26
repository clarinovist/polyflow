import { redirect } from 'next/navigation';

/** /sales/quotations/[id]/edit → unified SO edit */
export default async function QuotationEditRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/sales/orders/${id}/edit`);
}
