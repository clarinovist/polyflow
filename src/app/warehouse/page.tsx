import { prisma } from '@/lib/prisma';
import { getProductionFormData } from '@/actions/production';
import WarehouseRefreshWrapper from './WarehouseRefreshWrapper';
import { revalidatePath } from 'next/cache';
import { ProductionStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';

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

    const formData = await getProductionFormData();

    async function refreshData() {
        'use server';
        revalidatePath('/warehouse');
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Warehouse Operations</h1>
                    <p className="text-muted-foreground">Manage inventory, material issues, and receipts.</p>
                </div>
            </div>

            {/* Existing Job Queue (RefreshWrapper) */}
            <div className="grid gap-4 h-[calc(100vh-140px)]">
                <WarehouseRefreshWrapper
                    initialOrders={serializeData(orders) as unknown as ExtendedProductionOrder[]}
                    refreshData={refreshData}
                    formData={serializeData(formData)}
                />
            </div>
        </div>
    );
}
