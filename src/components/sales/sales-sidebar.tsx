'use client';

import {
    LayoutDashboard,
    FileText,
    ShoppingCart,
    Truck,
    Users2,
    BarChart3
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';

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
            { href: '/sales', icon: LayoutDashboard, label: 'Sales Dashboard' },
        ],
    },
    {
        heading: 'Transactions',
        items: [
            { href: '/sales/quotations', icon: FileText, label: 'Quotations' },
            { href: '/sales/orders', icon: ShoppingCart, label: 'Sales Orders' },
            { href: '/sales/deliveries', icon: Truck, label: 'Delivery Tracking' },
        ],
    },
    {
        heading: 'Customers',
        items: [
            { href: '/sales/customers', icon: Users2, label: 'Customer Management' },
        ],
    },
    {
        heading: 'Analytics',
        items: [
            { href: '/sales/analytics', icon: BarChart3, label: 'Sales Analytics' },
        ],
    },
];

export function SalesSidebar({ user }: SalesSidebarProps) {
    return (
        <PortalSidebarBase user={user} portalName="Sales" accentColor="blue">
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
