"use client";

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
} from "lucide-react";
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

const productionLinks = [
  {
    heading: "Hari Ini",
    items: [
      {
        href: "/production",
        icon: LayoutDashboard,
        label: productionSidebarLabels.overview,
        exact: true,
      },
    ],
  },
  {
    heading: "Antrean",
    items: [
      {
        href: "/production/orders",
        icon: Factory,
        label: productionSidebarLabels.workOrders,
      },
      {
        href: "/production/requests",
        icon: ClipboardCheck,
        label: productionSidebarLabels.incomingRequests,
      },
      {
        href: "/production/schedule",
        icon: Calendar,
        label: productionSidebarLabels.productionSchedule,
      },
    ],
  },
  {
    heading: "Lantai",
    items: [
      {
        href: "/production/daily",
        icon: CalendarPlus,
        label: productionSidebarLabels.dailyProduction,
      },
      {
        href: "/production/machines",
        icon: Factory,
        label: productionSidebarLabels.machineBoard,
      },
    ],
  },
  {
    heading: "Bahan & WIP",
    items: [
      {
        href: "/production/inventory",
        icon: Boxes,
        label: productionSidebarLabels.floorStock,
      },
      {
        href: "/production/mrp",
        icon: FileText,
        label: productionSidebarLabels.materialRequirements,
      },
    ],
  },
  {
    heading: "Resep",
    items: [
      {
        href: "/production/boms",
        icon: Files,
        label: productionSidebarLabels.bom,
      },
    ],
  },
  {
    heading: "Analitik",
    items: [
      {
        href: "/production/analytics",
        icon: BarChart3,
        label: productionSidebarLabels.productionAnalytics,
      },
      {
        href: "/production/costing",
        icon: TrendingUp,
        label: productionSidebarLabels.costingDashboard,
      },
      {
        href: "/production/packing-monthly",
        icon: FileText,
        label: productionSidebarLabels.packingMonthlyReport,
      },
    ],
  },
  {
    heading: "Lainnya",
    items: [
      {
        href: "/kiosk",
        icon: ClipboardCheck,
        label: productionSidebarLabels.operatorKiosk,
      },
      {
        href: "/production/history",
        icon: FileText,
        label: productionSidebarLabels.outputLogs,
      },
      {
        href: "/production/resources",
        icon: Users,
        label: productionSidebarLabels.teamShifts,
      },
    ],
  },
];

export function ProductionSidebar({ user, permissions }: ProductionSidebarProps) {
    const filteredGroups = filterNavGroups(productionLinks, permissions);
    return (
        <PortalSidebarBase user={user} portalName="Produksi" accentColor="emerald">
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
