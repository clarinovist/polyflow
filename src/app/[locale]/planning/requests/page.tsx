import { getSalesOrders } from '@/actions/sales';
import { ProductionRequestsClient } from '@/components/production/ProductionRequestsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Incoming Production Requests | PolyFlow',
    description: 'Manage incoming work requests from Sales',
};

export default async function ProductionRequestsPage() {
    // Ideally we would have a specific server action for this to filter on database level,
    // but for now we reuse existing and filter here.
    const allOrders = await getSalesOrders(true);

    // Filter for CONFIRMED (MTS) or IN_PRODUCTION (MTO) orders
    // that still need production processing (no work orders created yet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingOrders = (allOrders as any[]).filter(order =>
        (order.status === 'CONFIRMED' || order.status === 'IN_PRODUCTION') &&
        (order._count?.productionOrders === 0)
    );

    // Sort by Date Ascending (Oldest First) for FIFO processing
    pendingOrders.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Production Planning</h1>
            <ProductionRequestsClient orders={pendingOrders} />
        </div>
    );
}
