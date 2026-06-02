import { prisma } from '@/lib/core/prisma';
import { getProductionFormData } from '@/actions/production/production';
import WarehouseRefreshWrapper from './WarehouseRefreshWrapper';
import { ProductionStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { warehouseLabels } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
    // Fetch Job Queue (Existing Logic)
    const orders = await prisma.productionOrder.findMany({
        where: {
            status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] }
        },
        include: {
            bom: {
                include: {
                    productVariant: {
                        include: {
                            product: true
                        }
                    }
                }
            },
            machine: true,
            location: true,
            plannedMaterials: {
                include: {
                    productVariant: {
                        include: {
                            product: true
                        }
                    }
                }
            },
            materialIssues: {
                include: {
                    productVariant: true
                }
            }
        },
        orderBy: {
            plannedStartDate: 'asc'
        }
    });

    const formDataRes = await getProductionFormData();
    const formData = formDataRes.success && formDataRes.data ? formDataRes.data : { locations: [], operators: [], helpers: [], workShifts: [], boms: [], machines: [], rawMaterials: [] };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{warehouseLabels.warehouse}</h1>
                    <p className="text-muted-foreground">Kelola stok, pengambilan bahan, dan penerimaan barang.</p>
                </div>
            </div>

            {/* Existing Job Queue (RefreshWrapper) */}
            <div className="grid gap-4 h-[calc(100vh-140px)]">
                <WarehouseRefreshWrapper
                    initialOrders={serializeData(orders) as unknown as ExtendedProductionOrder[]}
                    formData={serializeData(formData)}
                />
            </div>
        </div>
    );
}
