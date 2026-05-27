'use client';

import {
    LayoutDashboard,
    FileText,
    ShoppingCart,
    Truck,
    Users2,
    RotateCcw,
    CircleDollarSign,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { salesSidebarLabels } from '@/lib/labels';

interface SalesSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    };
}

const salesLinks = [
    {
        heading: 'Overview',
        items: [
            { href: '/sales', icon: LayoutDashboard, label: salesSidebarLabels.salesDashboard },
        ],
    },
    {
        heading: 'Transactions',
        items: [
            { href: '/sales/quotations', icon: FileText, label: salesSidebarLabels.quotations },
            { href: '/sales/orders', icon: ShoppingCart, label: salesSidebarLabels.salesOrders },
            { href: '/sales/orders?view=mts-unpaid', icon: CircleDollarSign, label: salesSidebarLabels.mtsUnpaid },
            { href: '/sales/invoices', icon: FileText, label: salesSidebarLabels.salesInvoices },
            { href: '/sales/deliveries', icon: Truck, label: salesSidebarLabels.deliveryTracking },
            { href: '/sales/returns', icon: RotateCcw, label: salesSidebarLabels.salesReturns },
        ],
    },
    {
        heading: 'Customers',
        items: [
            { href: '/sales/customers', icon: Users2, label: salesSidebarLabels.customerManagement },
        ],
    },
];

export function SalesSidebar({ user }: SalesSidebarProps) {
    return (
        <PortalSidebarBase user={user} portalName="Sales" accentColor="blue">
            <div className="px-3 mb-2">
                <AdminBackButton role={user.role || undefined} />
            </div>
            {salesLinks.map((group) => (
                <PortalNavGroup
                    key={group.heading}
                    heading={group.heading}
                    items={group.items}
                    accentColor="blue"
                />
            ))}
        </PortalSidebarBase>
    );
}
