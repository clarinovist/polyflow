import { redirect } from 'next/navigation';

export default async function SalesMobileCustomerDetailPage(props: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await props.params;
    redirect(`/field/sales/customers/${id}`);
}
