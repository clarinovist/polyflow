'use client';

import {
    LayoutDashboard,
    FileText,
    ShoppingCart,
    Truck,
    Users2,
    RotateCcw,
    Smartphone,
    CalendarDays,
    Car,
    BarChart3,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { salesSidebarLabels } from '@/lib/labels';
import { filterNavGroups } from '@/lib/auth/permission-match';
import Link from 'next/link';

interface SalesSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    };
    /** Fresh rolePermission resources; 'ALL' for tenant admin */
    permissions?: string[] | 'ALL';
}

const salesLinks = [
    {
        heading: 'Hari Ini',
        items: [
            { href: '/sales', icon: LayoutDashboard, label: salesSidebarLabels.salesDashboard },
        ],
    },
    {
        heading: 'Transaksi',
        items: [
            { href: '/sales/quotations', icon: FileText, label: salesSidebarLabels.quotations },
            { href: '/sales/orders', icon: ShoppingCart, label: salesSidebarLabels.salesOrders },
            { href: '/sales/invoices', icon: FileText, label: salesSidebarLabels.salesInvoices },
            { href: '/sales/returns', icon: RotateCcw, label: salesSidebarLabels.salesReturns },
        ],
    },
    {
        heading: 'Pengiriman',
        items: [
            { href: '/sales/delivery-schedules', icon: CalendarDays, label: salesSidebarLabels.deliverySchedules },
            { href: '/sales/deliveries', icon: Truck, label: salesSidebarLabels.deliveryTracking },
            { href: '/sales/vehicles', icon: Car, label: salesSidebarLabels.vehicles },
        ],
    },
    {
        heading: 'Pelanggan',
        items: [
            { href: '/sales/customers', icon: Users2, label: salesSidebarLabels.customerManagement },
        ],
    },
    {
        heading: 'Laporan',
        items: [
            { href: '/sales/reports/sales-performance', icon: BarChart3, label: salesSidebarLabels.salesPerformance },
            { href: '/sales/reports/shipping-cost', icon: BarChart3, label: salesSidebarLabels.shippingCostReport },
        ],
    },
];

export function SalesSidebar({ user, permissions }: SalesSidebarProps) {
    const filteredGroups = filterNavGroups(salesLinks, permissions);
    return (
        <PortalSidebarBase user={user} portalName="Portal Sales" accentColor="blue">
            <div className="px-3 mb-2">
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
                    href="/sales/mobile"
                    className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                >
                    <Smartphone className="h-4 w-4" />
                    <span>{salesSidebarLabels.mobileMode}</span>
                </Link>
            </div>
        </PortalSidebarBase>
    );
}
