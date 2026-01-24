import { prisma } from '@/lib/prisma';
import { getProductionFormData } from '@/actions/production';
import WarehouseRefreshWrapper from './WarehouseRefreshWrapper';
import { revalidatePath } from 'next/cache';
import { ProductionStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
    const session = await auth();

    // 1. Fetch orders that are RELEASED or IN_PROGRESS 
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

    // Server action to refresh data
    async function refreshData() {
        'use server';
        revalidatePath('/warehouse');
    }

    return (
        <WarehouseRefreshWrapper
            initialOrders={serializeData(orders) as unknown as ExtendedProductionOrder[]}
            refreshData={refreshData}
            formData={serializeData(formData)}
            sessionUser={session?.user}
        />
    );
}
