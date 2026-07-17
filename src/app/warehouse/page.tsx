import { getProductionOrders } from '@/actions/production/production-orders';
import { getProductionFormData } from '@/actions/production/production';
import WarehouseRefreshWrapper from './WarehouseRefreshWrapper';
import { serializeData } from '@/lib/utils/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import type { ComponentProps } from 'react';
import { warehouseLabels } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
    const ordersRes = await getProductionOrders();
    const activeStatuses = ['RELEASED', 'IN_PROGRESS', 'WAITING_MATERIAL'];
    const orders = ordersRes.filter(o => activeStatuses.includes(o.status));

    const formDataRes = await getProductionFormData();
    const formData = formDataRes.success && formDataRes.data ? formDataRes.data : { locations: [], operators: [], helpers: [], workShifts: [], boms: [], machines: [], rawMaterials: [] };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{warehouseLabels.warehouse}</h1>
                    <p className="text-muted-foreground">
                        Kelola stok RM/FG, keluarkan bahan ke Mixing, catat pelembab ad-hoc, dan bantu antrean SPK.
                    </p>
                </div>
            </div>

            {/* Existing Job Queue (RefreshWrapper) */}
            <div className="grid gap-4 h-[calc(100vh-140px)]">
                <WarehouseRefreshWrapper
                    initialOrders={serializeData(orders) as unknown as ExtendedProductionOrder[]}
                    formData={serializeData(formData) as unknown as ComponentProps<typeof WarehouseRefreshWrapper>['formData']}
                />
            </div>
        </div>
    );
}
