import { prisma } from '@/lib/prisma';
import { getProductionFormData } from '@/actions/production';
import { getWarehouseDashboardStats } from '@/actions/warehouse-dashboard';
import WarehouseRefreshWrapper from './WarehouseRefreshWrapper';
import { revalidatePath } from 'next/cache';
import { ProductionStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { auth } from '@/auth';
import { Package, Truck, Boxes, MapPin } from 'lucide-react';
import { BrandCard, BrandCardContent, BrandCardHeader } from '@/components/brand/BrandCard';

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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <BrandCard variant="default" className="shadow-brand">
                    <BrandCardHeader className="p-5 pb-2 overflow-visible border-none">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <Package className="h-4 w-4 text-emerald-500" />
                            </div>
                            <h3 className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Job Queue</h3>
                        </div>
                    </BrandCardHeader>
                    <BrandCardContent className="p-5 pt-0">
                        <div className="text-2xl font-bold tracking-tight">{stats.pendingProduction}</div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight mt-0.5">Active Production Orders</p>
                    </BrandCardContent>
                </BrandCard>

                <BrandCard variant="default" className="shadow-brand">
                    <BrandCardHeader className="p-5 pb-2 overflow-visible border-none">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Truck className="h-4 w-4 text-blue-500" />
                            </div>
                            <h3 className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Incoming</h3>
                        </div>
                    </BrandCardHeader>
                    <BrandCardContent className="p-5 pt-0">
                        <div className="text-2xl font-bold tracking-tight">{stats.incomingReceipts}</div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight mt-0.5">Pending PO Deliveries</p>
                    </BrandCardContent>
                </BrandCard>

                <BrandCard variant="default" className="shadow-brand">
                    <BrandCardHeader className="p-5 pb-2 overflow-visible border-none">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <Boxes className="h-4 w-4 text-amber-500" />
                            </div>
                            <h3 className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Total SKUs</h3>
                        </div>
                    </BrandCardHeader>
                    <BrandCardContent className="p-5 pt-0">
                        <div className="text-2xl font-bold tracking-tight">{stats.totalSkus}</div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight mt-0.5">Active Product Variants</p>
                    </BrandCardContent>
                </BrandCard>

                <BrandCard variant="default" className="shadow-brand">
                    <BrandCardHeader className="p-5 pb-2 overflow-visible border-none">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <MapPin className="h-4 w-4 text-purple-500" />
                            </div>
                            <h3 className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Locations</h3>
                        </div>
                    </BrandCardHeader>
                    <BrandCardContent className="p-5 pt-0">
                        <div className="text-2xl font-bold tracking-tight">{stats.activeLocations}</div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight mt-0.5">Storage Zones</p>
                    </BrandCardContent>
                </BrandCard>
            </div>

            {/* Existing Job Queue (RefreshWrapper) */}
            <BrandCard>
                <BrandCardHeader className="p-5 border-none">
                    <h3 className="font-bold text-sm italic uppercase tracking-wider">Issue Queue</h3>
                </BrandCardHeader>
                <BrandCardContent className="p-0">
                    <WarehouseRefreshWrapper
                        initialOrders={serializeData(orders) as unknown as ExtendedProductionOrder[]}
                        refreshData={refreshData}
                        formData={serializeData(formData)}
                        sessionUser={session?.user}
                    />
                </BrandCardContent>
            </BrandCard>
        </div>
    );
}
