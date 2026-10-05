'use client';

import {
    LayoutDashboard,
    ClipboardList,
    ShoppingCart,
    FileText,
    RotateCcw,
    Truck,
    BarChart3,
    Package,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { purchasingSidebarLabels } from '@/lib/labels';
import { filterNavGroups } from '@/lib/auth/permission-match';
import { TenantSwitcher } from '@/components/layout/tenant-switcher';
import type { CentralWorkspaceOption } from '@/lib/auth/central-workspaces';

interface PurchasingSidebarProps {
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
    centralLoginHint?: boolean;
}

const purchasingLinks = [
    {
        heading: 'Hari Ini',
        items: [
            {
                href: '/purchasing',
                icon: LayoutDashboard,
                label: purchasingSidebarLabels.homeBoard,
            },
        ],
    },
    {
        heading: 'Transaksi',
        items: [
            {
                href: '/purchasing/requests',
                icon: ClipboardList,
                label: purchasingSidebarLabels.purchaseRequests,
            },
            {
                href: '/purchasing/orders',
                icon: ShoppingCart,
                label: purchasingSidebarLabels.purchaseOrders,
            },
            {
                href: '/purchasing/invoices',
                icon: FileText,
                label: 'Invoice Pembelian',
            },
            {
                href: '/purchasing/returns',
                icon: RotateCcw,
                label: purchasingSidebarLabels.purchaseReturns,
            },
        ],
    },
    {
        heading: 'Master',
        items: [
            {
                href: '/purchasing/suppliers',
                icon: Truck,
                label: purchasingSidebarLabels.supplierManagement,
            },
        ],
    },
    {
        heading: 'Maklon',
        items: [
            {
                href: '/maklon/receipts',
                icon: Package,
                label: 'Monitor Penerimaan Maklon',
            },
        ],
    },
    {
        heading: 'Laporan',
        items: [
            {
                href: '/purchasing/analytics',
                icon: BarChart3,
                label: purchasingSidebarLabels.procurementAnalytics,
            },
        ],
    },
];

export function PurchasingSidebar({
    user,
    permissions,
    currentTenantId,
    currentTenantName,
    workspaces = [],
    centralLoginHint = false,
}: PurchasingSidebarProps) {
    const filteredGroups = filterNavGroups(purchasingLinks, permissions);
    return (
        <PortalSidebarBase
            user={user}
            portalName="Portal Pembelian"
            accentColor="purple"
        >
            {currentTenantName && (
                <div className="px-3 pt-3">
                    <TenantSwitcher
                        currentTenantId={currentTenantId}
                        currentTenantName={currentTenantName}
                        workspaces={workspaces}
                        centralLoginHint={centralLoginHint}
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
                    accentColor="purple"
                />
            ))}
        </PortalSidebarBase>
    );
}
