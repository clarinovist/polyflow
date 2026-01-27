'use client';

import {
    LayoutDashboard,
    Factory,
    Calendar,
    FileText,
    ShoppingCart,
    Truck,
    BarChart3
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';

interface PlanningSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    };
}

const planningLinks = [
    {
        heading: 'Overview',
        items: [
            { href: '/planning', icon: LayoutDashboard, label: 'Planning Dashboard' },
        ],
    },
    {
        heading: 'Production Planning',
        items: [
            { href: '/planning/orders', icon: Factory, label: 'Work Orders' },
            { href: '/planning/schedule', icon: Calendar, label: 'Production Schedule' },
            { href: '/planning/mrp', icon: FileText, label: 'Material Requirements' },
        ],
    },
    {
        heading: 'Procurement',
        items: [
            { href: '/planning/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
            { href: '/planning/suppliers', icon: Truck, label: 'Supplier Management' },
        ],
    },
    {
        heading: 'Analytics',
        items: [
            { href: '/planning/production-analytics', icon: BarChart3, label: 'Production Analytics' },
            { href: '/planning/procurement-analytics', icon: BarChart3, label: 'Procurement Analytics' },
        ],
    },
];

export function PlanningSidebar({ user }: PlanningSidebarProps) {
    return (
        <PortalSidebarBase user={user} portalName="Planning" accentColor="amber">
            <div className="px-3 mb-2">
                <AdminBackButton role={user.role || undefined} />
            </div>
            {planningLinks.map((group) => (
                <PortalNavGroup
                    key={group.heading}
                    heading={group.heading}
                    items={group.items}
                    accentColor="amber"
                />
            ))}
        </PortalSidebarBase>
    );
}
