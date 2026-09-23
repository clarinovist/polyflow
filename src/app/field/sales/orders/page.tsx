import { getMyFieldSalesOrders } from '@/actions/sales/field-actions';
import { OrderListClient } from './OrderListClient';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export default async function SalesMobileOrdersPage() {
    const ordersRes = await getMyFieldSalesOrders();
    if (!ordersRes.success) return <MobileReadError title="Daftar pesanan belum tersedia" />;
    const orders = ordersRes.data;

    const serialized = orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: String(o.orderDate),
        status: o.status,
        totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
        customerName: o.customer?.name || 'Internal',
        itemCount: o._count?.items ?? 0,
    }));

    return <OrderListClient orders={serialized} />;
}
