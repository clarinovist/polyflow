"use client";

import {
  LayoutDashboard,
  CalendarPlus,
  Factory,
  Boxes,
  History,
  Clock,
  Users,
  ClipboardCheck,
  FileText,
  BarChart3,
  Calendar,
} from "lucide-react";
import { PortalSidebarBase } from "@/components/layout/portal-sidebar-base";
import { PortalNavGroup } from "@/components/layout/portal-nav-item";
import { AdminBackButton } from "@/components/layout/admin-back-button";
import { productionSidebarLabels } from "@/lib/labels";

interface ProductionSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
}

const productionLinks = [
  {
    heading: "Overview",
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
    heading: "Production Planning",
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
      {
        href: "/production/mrp",
        icon: FileText,
        label: productionSidebarLabels.materialRequirements,
      },
    ],
  },
  {
    heading: "Floor Management",
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
    heading: "Resources & Stock",
    items: [
      {
        href: "/production/inventory",
        icon: Boxes,
        label: productionSidebarLabels.floorStock,
      },
      {
        href: "/production/resources",
        icon: Users,
        label: productionSidebarLabels.teamShifts,
      },
      {
        href: "/production/history",
        icon: History,
        label: productionSidebarLabels.outputLogs,
      },
      {
        href: "/production/packing-monthly",
        icon: FileText,
        label: productionSidebarLabels.packingMonthlyReport,
      },
      {
        href: "/production/shifts",
        icon: Clock,
        label: productionSidebarLabels.workShifts,
      },
    ],
  },
  {
    heading: "Analytics & Tools",
    items: [
      {
        href: "/production/analytics",
        icon: BarChart3,
        label: productionSidebarLabels.productionAnalytics,
      },
      {
        href: "/kiosk",
        icon: ClipboardCheck,
        label: productionSidebarLabels.operatorKiosk,
      },
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
