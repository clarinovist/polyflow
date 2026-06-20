'use client';

import {
    LayoutDashboard,
    Warehouse,
    PackageSearch,
    ChevronRight,
    ClipboardCheck,
    ArrowLeftRight,
    PackagePlus,
    Clock,
    History,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { warehouseSidebarLabels } from '@/lib/labels';

interface WarehouseSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    }
}

const warehouseLinks = [
    {
        heading: 'Operations',
        items: [
            { href: '/warehouse', icon: LayoutDashboard, label: warehouseSidebarLabels.jobQueue, exact: true },
            { href: '/warehouse/incoming', icon: PackageSearch, label: warehouseSidebarLabels.incomingReceipts },
            { href: '/warehouse/outgoing', icon: ChevronRight, label: warehouseSidebarLabels.outgoingOrders },
        ],
    },
    {
        heading: 'Inventory',
        items: [
            { href: '/warehouse/inventory', icon: Warehouse, label: warehouseSidebarLabels.stockOverview },
            { href: '/warehouse/opname', icon: ClipboardCheck, label: warehouseSidebarLabels.stockOpname },
            { href: '/warehouse/inventory/transfer', icon: ArrowLeftRight, label: warehouseSidebarLabels.stockTransfer },
            { href: '/warehouse/inventory/adjustment', icon: PackagePlus, label: warehouseSidebarLabels.stockAdjustment },
            { href: '/warehouse/inventory/aging', icon: Clock, label: warehouseSidebarLabels.stockAging },
            { href: '/warehouse/inventory/history', icon: History, label: warehouseSidebarLabels.historyLogs },
        ],
    },
    {
        heading: 'Master Data',
        items: [
            { href: '/warehouse/locations', icon: Warehouse, label: warehouseSidebarLabels.locations },
        ],
    },
];

export function WarehouseSidebar({ user }: WarehouseSidebarProps) {
    return (
        <PortalSidebarBase user={user} portalName="Gudang" accentColor="primary">
            <div className="px-3 mb-2">
                <AdminBackButton />
            </div>
            {warehouseLinks.map((group) => (
                <PortalNavGroup
                    key={group.heading}
                    heading={group.heading}
                    items={group.items}
                    accentColor="primary"
                />
            ))}
        </PortalSidebarBase>
    );
}
