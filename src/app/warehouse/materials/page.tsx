import { getProductionOrders } from '@/actions/production/production-orders';
import {
    getPendingAdditionalMaterialRequests,
    getProductionFormData,
} from '@/actions/production/production';
import WarehouseRefreshWrapper from '../WarehouseRefreshWrapper';
import { serializeData } from '@/lib/utils/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import type { ComponentProps } from 'react';

export const dynamic = 'force-dynamic';

export default async function WarehouseMaterialsPage({
    searchParams,
}: {
    searchParams: Promise<{ orderId?: string }>;
}) {
    const params = await searchParams;
    const [ordersRes, formDataRes, pendingRequestsRes] = await Promise.all([
        getProductionOrders(),
        getProductionFormData(),
        getPendingAdditionalMaterialRequests(),
    ]);
    const activeStatuses = ['RELEASED', 'IN_PROGRESS', 'WAITING_MATERIAL'];
    const pendingOrderIds = new Set(
        pendingRequestsRes.success
            ? pendingRequestsRes.data.map((request) => request.productionOrderId)
            : [],
    );
    const orders = ordersRes.filter(
        (order) =>
            activeStatuses.includes(order.status) || pendingOrderIds.has(order.id),
    );
    const initialOrderId = orders.some(
        (order) =>
            order.id === params.orderId &&
            order.materialConsumptionMode !== 'DIRECT',
    )
        ? params.orderId
        : undefined;

    const formData =
        formDataRes.success && formDataRes.data
            ? formDataRes.data
            : {
                  locations: [],
                  operators: [],
                  helpers: [],
                  workShifts: [],
                  boms: [],
                  machines: [],
                  rawMaterials: [],
              };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Bahan Produksi
                    </h1>
                    <p className="text-muted-foreground">
                        Keluarkan RM ke Mixing, review permintaan bahan tambahan
                        dari kiosk, dan kelola antrean SPK.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 h-[calc(100vh-140px)]">
                <WarehouseRefreshWrapper
                    initialOrderId={initialOrderId}
                    pendingAdditionalMaterialRequests={
                        pendingRequestsRes.success
                            ? serializeData(pendingRequestsRes.data)
                            : []
                    }
                    initialOrders={
                        serializeData(
                            orders,
                        ) as unknown as ExtendedProductionOrder[]
                    }
                    formData={
                        serializeData(formData) as unknown as ComponentProps<
                            typeof WarehouseRefreshWrapper
                        >['formData']
                    }
                />
            </div>
        </div>
    );
}
