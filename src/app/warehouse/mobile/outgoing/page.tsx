import { getOpenDeliveryOrders } from '@/actions/inventory/deliveries';
import { serializeData } from '@/lib/utils/utils';
import { WarehouseOutgoingMobileClient } from './WarehouseOutgoingMobileClient';
import { MobileReadError } from '@/components/mobile';

export default async function WarehouseMobileOutgoingPage() {
    const result = await getOpenDeliveryOrders();
    if (!result.success) {
        return <MobileReadError title="Antrean muat belum tersedia" />;
    }
    const openOrders = result.data ? serializeData(result.data) : [];

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
