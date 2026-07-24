'use client';

import {
    LayoutDashboard,
    Warehouse,
    PackageSearch,
    ChevronRight,
    ClipboardCheck,
    ClipboardList,
    BarChart3,
    Package,
    RotateCcw,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { warehouseSidebarLabels } from '@/lib/labels';
import { filterNavGroups } from '@/lib/auth/permission-match';

interface WarehouseSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
        image?: string | null;
    };
    /** Fresh rolePermission resources; 'ALL' for tenant admin */
    permissions?: string[] | 'ALL';
}

const warehouseLinks = [
    {
        heading: 'Operasi',
        items: [
            { href: '/warehouse', icon: LayoutDashboard, label: warehouseSidebarLabels.homeBoard, exact: true },
            { href: '/warehouse/incoming', icon: PackageSearch, label: warehouseSidebarLabels.incomingReceipts },
            { href: '/warehouse/outgoing', icon: ChevronRight, label: warehouseSidebarLabels.outgoingOrders },
            { href: '/warehouse/materials', icon: ClipboardList, label: warehouseSidebarLabels.materialProduction },
            { href: '/warehouse/opname', icon: ClipboardCheck, label: warehouseSidebarLabels.stockOpname },
        ],
    },
    {
        heading: 'Maklon',
        items: [
            { href: '/warehouse/maklon/receipts', icon: Package, label: 'Penerimaan Maklon' },
            { href: '/warehouse/maklon/returns', icon: RotateCcw, label: 'Retur Maklon' },
        ],
    },
    {
        heading: 'Persediaan',
        items: [
            { href: '/warehouse/inventory', icon: Warehouse, label: warehouseSidebarLabels.stockOverview },
            { href: '/warehouse/locations', icon: Warehouse, label: warehouseSidebarLabels.locations },
        ],
    },
    {
        heading: 'Analitik',
        items: [
            { href: '/warehouse/analytics', icon: BarChart3, label: warehouseSidebarLabels.analyticsDashboard },
        ],
    },
];

export function WarehouseSidebar({ user, permissions }: WarehouseSidebarProps) {
    const filteredGroups = filterNavGroups(warehouseLinks, permissions);

    return (
        <PortalSidebarBase user={user} portalName="Gudang" accentColor="primary">
            <div className="px-3 mb-2">
                <AdminBackButton />
            </div>
            {filteredGroups.map((group) => (
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
