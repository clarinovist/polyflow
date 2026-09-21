'use client';

import type { ComponentProps } from 'react';
import {
    LayoutDashboard,
    CalendarPlus,
    Factory,
    Boxes,
    Users,
    ClipboardCheck,
    FileText,
    BarChart3,
    Calendar,
    TrendingUp,
    Files,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { productionSidebarLabels } from '@/lib/labels';
import { filterNavGroups } from '@/lib/auth/permission-match';

interface ProductionSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
        image?: string | null;
    };
    permissions?: string[] | 'ALL';
}

export const productionLinks: Pick<
    ComponentProps<typeof PortalNavGroup>,
    'heading' | 'items'
>[] = [
    {
        heading: 'Hari Ini',
        items: [
            {
                href: '/production',
                icon: LayoutDashboard,
                label: productionSidebarLabels.overview,
                exact: true,
            },
        ],
    },
    {
        heading: 'Perencanaan',
        items: [
            {
                href: '/production/runs',
                icon: Factory,
                label: 'Rangkaian Produksi',
            },
            {
                href: '/production/requests',
                icon: ClipboardCheck,
                label: productionSidebarLabels.incomingRequests,
            },
            {
                href: '/production/schedule',
                icon: Calendar,
                label: productionSidebarLabels.productionSchedule,
            },
        ],
    },
    {
        heading: 'Operasional',
        items: [
            {
                href: '/production/orders',
                icon: Factory,
                label: productionSidebarLabels.workOrders,
                children: [
                    {
                        href: '/production/orders',
                        icon: Files,
                        label: 'Daftar',
                    },
                    {
                        href: '/production/daily',
                        icon: CalendarPlus,
                        label: 'Board Proses',
                        exact: true,
                    },
                ],
            },
            {
                href: '/production/machines',
                icon: Factory,
                label: productionSidebarLabels.machineBoard,
            },
            {
                href: '/kiosk',
                icon: ClipboardCheck,
                label: productionSidebarLabels.operatorKiosk,
            },
        ],
    },
    {
        heading: 'Bahan & WIP',
        items: [
            {
                href: '/production/inventory',
                icon: Boxes,
                label: productionSidebarLabels.floorStock,
            },
            {
                href: '/production/mrp',
                icon: FileText,
                label: productionSidebarLabels.materialRequirements,
            },
        ],
    },
    {
        heading: 'Master & Pengaturan',
        items: [
            {
                href: '/production/boms',
                icon: Files,
                label: productionSidebarLabels.bom,
            },
            {
                href: '/production/routings',
                icon: Files,
                label: 'Routing Produksi',
            },
            {
                href: '/production/resources',
                icon: Users,
                label: productionSidebarLabels.teamShifts,
            },
            {
                href: '/production/shifts',
                icon: Calendar,
                label: productionSidebarLabels.workShifts,
            },
        ],
    },
    {
        heading: 'Laporan & Audit',
        items: [
            {
                href: '/production/analytics',
                icon: BarChart3,
                label: productionSidebarLabels.productionAnalytics,
            },
            {
                href: '/production/daily-report',
                icon: BarChart3,
                label: productionSidebarLabels.dailyReport,
            },
            {
                href: '/production/output-report',
                icon: FileText,
                label: productionSidebarLabels.outputReport,
            },
            {
                href: '/production/history',
                icon: FileText,
                label: productionSidebarLabels.outputLogs,
            },
            {
                href: '/production/costing',
                icon: TrendingUp,
                label: productionSidebarLabels.costingDashboard,
            },
            {
                href: '/production/packing-monthly',
                icon: FileText,
                label: productionSidebarLabels.packingMonthlyReport,
            },
        ],
    },
];

export function getProductionNavGroups(permissions?: string[] | 'ALL') {
    return filterNavGroups(productionLinks, permissions).map((group) => ({
        ...group,
        // In collapsed mode the parent is a link: target a visible view,
        // including users granted only the board and not the list.
        items: group.items.map((item) => ({
            ...item,
            href: item.children?.[0]?.href ?? item.href,
            exact: item.children?.[0]?.exact ?? item.exact,
        })),
    }));
}

export function ProductionSidebar({
    user,
    permissions,
}: ProductionSidebarProps) {
    const filteredGroups = getProductionNavGroups(permissions);
    return (
        <PortalSidebarBase
            user={user}
            portalName="Produksi"
            accentColor="emerald"
        >
            <div className="px-3 mb-2">
                <AdminBackButton />
            </div>
            {filteredGroups.map((group) => (
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
