import { getOpenDeliveryOrders } from '@/actions/inventory/deliveries';
import { serializeData } from '@/lib/utils/utils';
import { WarehouseOutgoingMobileClient } from './WarehouseOutgoingMobileClient';

export default async function WarehouseMobileOutgoingPage() {
    const result = await getOpenDeliveryOrders();
    const openOrders = result.success && result.data
        ? serializeData(result.data)
        : [];

    return <WarehouseOutgoingMobileClient orders={openOrders as {
        id: string;
        orderNumber: string;
        status: string;
        deliveryDate: string;
        loadVerifiedAt?: string | null;
        sourceLocation?: { name: string };
        salesOrder?: { customer?: { name: string } };
        items?: { id: string; verifiedQuantity?: number | null }[];
    }[]} />;
}
