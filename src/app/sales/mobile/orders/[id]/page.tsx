import { redirect } from 'next/navigation';

export default async function SalesMobileOrderDetailPage(props: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await props.params;
    redirect(`/field/sales/orders/${id}`);
}
