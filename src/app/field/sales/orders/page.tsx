import { getMyFieldSalesOrders } from '@/actions/sales/field-actions';
import { OrderListClient } from './OrderListClient';
import { MobileReadError } from '@/components/mobile/MobileReadError';

interface SalesMobileOrdersPageProps {
    searchParams?: Promise<{ followUpDue?: string }>;
}

export default async function SalesMobileOrdersPage(
    props?: SalesMobileOrdersPageProps,
) {
    const params = props?.searchParams ? await props.searchParams : undefined;
    const followUpDue = params?.followUpDue;
    const ordersRes = await getMyFieldSalesOrders();
    if (!ordersRes.success) return <MobileReadError title="Daftar pesanan belum tersedia" />;
    const orders = ordersRes.data;

    const serialized = orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: String(o.orderDate),
        status: o.status,
        orderType: o.orderType,
        totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
        customerName: o.customer?.name || 'Internal',
        itemCount: o._count?.items ?? 0,
        nextFollowUpDate: o.nextFollowUpDate ? String(o.nextFollowUpDate) : null,
        validUntil: o.validUntil ? String(o.validUntil) : null,
    }));

    return (
        <OrderListClient
            orders={serialized}
            initialFollowUpDue={followUpDue === '1'}
        />
    );
}
