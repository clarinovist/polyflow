import { prisma } from '@/lib/prisma';
import { getProductionFormData } from '@/actions/production';
import WarehouseRefreshWrapper from './WarehouseRefreshWrapper';
import { revalidatePath } from 'next/cache';
import { ProductionStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
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

    const employees = await prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' }
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
            employees={serializeData(employees)}
            refreshData={refreshData}
            formData={serializeData(formData)}
        />
    );
}
