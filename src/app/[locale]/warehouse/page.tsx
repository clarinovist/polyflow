import { prisma } from '@/lib/prisma';
import { getProductionFormData } from '@/actions/production';
import { getWarehouseDashboardStats } from '@/actions/warehouse-dashboard';
import WarehouseRefreshWrapper from './WarehouseRefreshWrapper';
import { revalidatePath } from 'next/cache';
import { ProductionStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { auth } from '@/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Truck, Boxes, MapPin } from 'lucide-react';

import { PageHeader } from '@/components/ui/page-header';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
    const session = await auth();

    // Fetch Stats
    const stats = await getWarehouseDashboardStats();

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
            <PageHeader
                title="Warehouse Operations"
                description="Manage inventory, material issues, and receipts."
            />

            {/* Premium Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Job Queue (Material)</CardTitle>
                        <Package className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pendingProduction}</div>
                        <p className="text-xs text-muted-foreground">Active production orders</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Incoming Receipts</CardTitle>
                        <Truck className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.incomingReceipts}</div>
                        <p className="text-xs text-muted-foreground">Pending PO deliveries</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total SKUs</CardTitle>
                        <Boxes className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalSkus}</div>
                        <p className="text-xs text-muted-foreground">Active product variants</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-l-4 border-l-purple-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Locations</CardTitle>
                        <MapPin className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeLocations}</div>
                        <p className="text-xs text-muted-foreground">Storage zones</p>
                    </CardContent>
                </Card>
            </div>

            {/* Existing Job Queue (RefreshWrapper) */}
            <Card>
                <CardHeader>
                    <CardTitle>Material Issue Queue</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <WarehouseRefreshWrapper
                        initialOrders={serializeData(orders) as unknown as ExtendedProductionOrder[]}
                        refreshData={refreshData}
                        formData={serializeData(formData)}
                        sessionUser={session?.user}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
