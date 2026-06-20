'use client';

import {
    LayoutDashboard,
    Factory,
    Calendar,
    FileText,
    ShoppingCart,
    Truck,
    BarChart3,
    ClipboardCheck,
    ClipboardList,
    RotateCcw
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { planningSidebarLabelsExtended } from '@/lib/labels';

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
            { href: '/planning', icon: LayoutDashboard, label: planningSidebarLabelsExtended.planningDashboard },
        ],
    },
    {
        heading: 'Production Planning',
        items: [
            { href: '/planning/orders', icon: Factory, label: planningSidebarLabelsExtended.workOrders },
            { href: '/planning/requests', icon: ClipboardCheck, label: planningSidebarLabelsExtended.incomingRequests },
            { href: '/planning/schedule', icon: Calendar, label: planningSidebarLabelsExtended.productionSchedule },
            { href: '/planning/mrp', icon: FileText, label: planningSidebarLabelsExtended.materialRequirements },
        ],
    },
    {
        heading: 'Procurement',
        items: [
            { href: '/planning/purchase-requests', icon: ClipboardList, label: planningSidebarLabelsExtended.purchaseRequests },
            { href: '/planning/purchase-orders', icon: ShoppingCart, label: planningSidebarLabelsExtended.purchaseOrders },
            { href: '/planning/purchase-returns', icon: RotateCcw, label: planningSidebarLabelsExtended.purchaseReturns },
            { href: '/planning/suppliers', icon: Truck, label: planningSidebarLabelsExtended.supplierManagement },
        ],
    },
    {
        heading: 'Analytics',
        items: [
            { href: '/planning/production-analytics', icon: BarChart3, label: planningSidebarLabelsExtended.productionAnalytics },
            { href: '/planning/procurement-analytics', icon: BarChart3, label: planningSidebarLabelsExtended.procurementAnalytics },
        ],
    },
];

export function PlanningSidebar({ user }: PlanningSidebarProps) {
    return (
        <PortalSidebarBase user={user} portalName="Planning" accentColor="amber">
            <div className="px-3 mb-2">
                <AdminBackButton />
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
