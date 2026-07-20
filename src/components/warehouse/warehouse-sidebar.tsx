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
    BarChart3,
    Package,
    RotateCcw,
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
    };
    /** Fresh rolePermission resources; 'ALL' for tenant admin */
    permissions?: string[] | 'ALL';
}

const warehouseLinks = [
    {
        heading: 'Operasi',
        items: [
            { href: '/warehouse', icon: LayoutDashboard, label: warehouseSidebarLabels.jobQueue, exact: true },
            { href: '/warehouse/incoming', icon: PackageSearch, label: warehouseSidebarLabels.incomingReceipts },
            { href: '/warehouse/outgoing', icon: ChevronRight, label: warehouseSidebarLabels.outgoingOrders },
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
            { href: '/warehouse/inventory/transfer', icon: ArrowLeftRight, label: warehouseSidebarLabels.stockTransfer },
            { href: '/warehouse/inventory/adjustment', icon: PackagePlus, label: warehouseSidebarLabels.stockAdjustment },
            { href: '/warehouse/inventory/aging', icon: Clock, label: warehouseSidebarLabels.stockAging },
            { href: '/warehouse/locations', icon: Warehouse, label: warehouseSidebarLabels.locations },
        ],
    },
    {
        heading: 'Analitik',
        items: [
            { href: '/warehouse/analytics', icon: BarChart3, label: warehouseSidebarLabels.analyticsDashboard },
            { href: '/warehouse/inventory/history', icon: History, label: warehouseSidebarLabels.stockMovement },
        ],
    },
];

function canSeeWarehouseLink(
    href: string,
    permissions: string[] | 'ALL' | undefined,
): boolean {
    // Backward compatible: no permissions prop → full menu (warehouse-native roles)
    if (permissions === undefined || permissions === 'ALL') return true;
    // Module root grant from Access Control → full warehouse portal
    if (permissions.includes('/warehouse')) return true;

    return permissions.some(
        (p) =>
            href === p ||
            href.startsWith(`${p}/`) ||
            // parent nav of a nested grant (e.g. inventory section)
            (p.startsWith(`${href}/`) && href !== '/warehouse'),
    );
}

export function WarehouseSidebar({ user, permissions }: WarehouseSidebarProps) {
    const filteredGroups = warehouseLinks
        .map((group) => ({
            ...group,
            items: group.items.filter((item) =>
                canSeeWarehouseLink(item.href, permissions),
            ),
        }))
        .filter((group) => group.items.length > 0);

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
