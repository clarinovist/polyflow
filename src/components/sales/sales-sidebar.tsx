'use client';

import {
    LayoutDashboard,
    FileText,
    ShoppingCart,
    Truck,
    Users2,
    UserCog,
    RotateCcw,
    Smartphone,
    CalendarDays,
    Car,
    BarChart3,
    Route,
    MapPinned,
    UserSearch,
    Target,
    Wallet,
    Tag,
    HandCoins,
    Kanban,
    Receipt,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { salesSidebarLabels } from '@/lib/labels';
import { filterNavGroups } from '@/lib/auth/permission-match';
import { TenantSwitcher } from '@/components/layout/tenant-switcher';
import type { CentralWorkspaceOption } from '@/lib/auth/central-workspaces';
import Link from 'next/link';

interface SalesSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
        image?: string | null;
    };
    permissions?: string[] | 'ALL';
    currentTenantId?: string;
    currentTenantName?: string;
    workspaces?: CentralWorkspaceOption[];
}

export const salesLinks = [
    {
        heading: 'Hari Ini',
        items: [
            {
                href: '/sales',
                icon: LayoutDashboard,
                label: salesSidebarLabels.salesDashboard,
                exact: true,
            },
        ],
    },
    {
        heading: 'Transaksi',
        items: [
            {
                href: '/sales/orders',
                icon: ShoppingCart,
                label: salesSidebarLabels.salesOrders,
            },
            {
                href: '/sales/invoices',
                icon: FileText,
                label: salesSidebarLabels.salesInvoices,
            },
            {
                href: '/sales/returns',
                icon: RotateCcw,
                label: salesSidebarLabels.salesReturns,
            },
        ],
    },
    {
        heading: 'Pengiriman',
        items: [
            {
                href: '/sales/delivery-schedules',
                icon: CalendarDays,
                label: salesSidebarLabels.deliverySchedules,
            },
            {
                href: '/sales/deliveries',
                icon: Truck,
                label: salesSidebarLabels.deliveryTracking,
            },
            {
                href: '/sales/vehicles',
                icon: Car,
                label: salesSidebarLabels.vehicles,
            },
            {
                href: '/sales/tariffs',
                icon: Receipt,
                label: salesSidebarLabels.shippingTariffs,
            },
        ],
    },
    {
        heading: 'Pelanggan',
        items: [
            {
                href: '/sales/customers',
                icon: Users2,
                label: salesSidebarLabels.customerManagement,
            },
            {
                href: '/sales/price-list',
                icon: Tag,
                label: salesSidebarLabels.priceList,
            },
            {
                href: '/sales/routes',
                icon: Route,
                label: salesSidebarLabels.dailyRoutes,
            },
            {
                href: '/sales/team',
                icon: UserCog,
                label: salesSidebarLabels.salesTeam,
            },
            {
                href: '/sales/targets',
                icon: Target,
                label: salesSidebarLabels.targets,
            },
        ],
    },
    {
        heading: 'Lapangan',
        items: [
            {
                href: '/sales/visits',
                icon: MapPinned,
                label: salesSidebarLabels.visits,
            },
            {
                href: '/sales/prospects',
                icon: UserSearch,
                label: salesSidebarLabels.prospects,
            },
        ],
    },
    {
        heading: 'Penagihan',
        items: [
            {
                href: '/sales/collection',
                icon: HandCoins,
                label: salesSidebarLabels.collection,
            },
        ],
    },
    {
        heading: 'Laporan',
        items: [
            {
                href: '/sales/pipeline',
                icon: Kanban,
                label: 'Pipeline Penawaran',
            },
            {
                href: '/sales/reports/margin',
                icon: BarChart3,
                label: 'Laporan Margin',
            },
            {
                href: '/sales/reports/customer-activity',
                icon: Users2,
                label: 'Aktivitas Customer',
            },
            {
                href: '/sales/reports/sales-performance',
                icon: BarChart3,
                label: salesSidebarLabels.salesPerformance,
            },
            {
                href: '/sales/reports/commission',
                icon: Wallet,
                label: salesSidebarLabels.commissionReport,
            },
            {
                href: '/sales/reports/shipping-cost',
                icon: BarChart3,
                label: salesSidebarLabels.shippingCostReport,
            },
        ],
    },
];

export function SalesSidebar({
    user,
    permissions,
    currentTenantId,
    currentTenantName,
    workspaces = [],
}: SalesSidebarProps) {
    const filteredGroups = filterNavGroups(salesLinks, permissions);
    return (
        <PortalSidebarBase
            user={user}
            portalName="Portal Sales"
            accentColor="blue"
            assistantSlots
            assistantSlotPrefix="sales"
        >
            {currentTenantName && (
                <div className="px-3 pt-3">
                    <TenantSwitcher
                        currentTenantId={currentTenantId}
                        currentTenantName={currentTenantName}
                        workspaces={workspaces}
                    />
                </div>
            )}
            <div className="px-3 mb-2 mt-2">
                <AdminBackButton />
            </div>
            {filteredGroups.map((group) => (
                <PortalNavGroup
                    key={group.heading}
                    heading={group.heading}
                    items={group.items}
                    accentColor="blue"
                />
            ))}
            {/* Mobile Mode — footer entry */}
            <div className="mt-auto pt-4 border-t border-sidebar-border mx-3">
                <Link
                    href="/field/sales"
                    className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                >
                    <Smartphone className="h-4 w-4" />
                    <span>{salesSidebarLabels.mobileMode}</span>
                </Link>
            </div>
        </PortalSidebarBase>
    );
}
