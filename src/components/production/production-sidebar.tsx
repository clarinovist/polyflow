'use client';

import {
    LayoutDashboard,
    Factory,
    Boxes,
    History,
    Calculator,
    Clock,
    Users,
    ClipboardCheck,
    FileText,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { productionSidebarLabels } from '@/lib/labels';

interface ProductionSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    }
}

const productionLinks = [
    {
        heading: 'Floor Management',
        items: [
            { href: '/production', icon: LayoutDashboard, label: productionSidebarLabels.overview, exact: true },
            { href: '/production/machines', icon: Factory, label: productionSidebarLabels.machineBoard },
        ],
    },
    {
        heading: 'Resources & Stock',
        items: [
            { href: '/production/inventory', icon: Boxes, label: productionSidebarLabels.floorStock },
            { href: '/production/resources', icon: Users, label: productionSidebarLabels.teamShifts },
            { href: '/production/history', icon: History, label: productionSidebarLabels.outputLogs },
            { href: '/production/packing-monthly', icon: FileText, label: productionSidebarLabels.packingMonthlyReport },
            { href: '/production/costing', icon: Calculator, label: productionSidebarLabels.productionCosting },
            { href: '/production/shifts', icon: Clock, label: productionSidebarLabels.workShifts },
        ],
    },
    {
        heading: 'Tools',
        items: [
            { href: '/kiosk', icon: ClipboardCheck, label: productionSidebarLabels.operatorKiosk },
        ],
    },
];

export function ProductionSidebar({ user }: ProductionSidebarProps) {
    return (
        <PortalSidebarBase user={user} portalName="Produksi" accentColor="emerald">
            <div className="px-3 mb-2">
                <AdminBackButton />
            </div>
            {productionLinks.map((group) => (
                <PortalNavGroup
                    key={group.heading}
                    heading={group.heading}
                    items={group.items}
                    accentColor="emerald"
                />
            ))}
        </PortalSidebarBase>
    );
}
