"use client";

import {
  LayoutDashboard,
  Clock,
  Wallet,
  Scale,
  CalendarRange,
  HandCoins,
  CalendarDays,
  Gavel,
  AlertTriangle,
  Users,
} from "lucide-react";
import { PortalSidebarBase } from "@/components/layout/portal-sidebar-base";
import { PortalNavGroup } from "@/components/layout/portal-nav-item";
import { AdminBackButton } from "@/components/layout/admin-back-button";
import { hrdSidebarLabels } from "@/lib/labels";
import { filterNavGroups } from "@/lib/auth/permission-match";

interface HrdSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  /** Fresh rolePermission resources; 'ALL' for tenant admin */
  permissions?: string[] | "ALL";
}

const hrdLinks = [
  {
    heading: "Ringkasan",
    items: [
      {
        href: "/hrd",
        icon: LayoutDashboard,
        label: hrdSidebarLabels.dashboard,
        exact: true,
      },
    ],
  },
  {
    heading: "Kehadiran",
    items: [
      {
        href: "/hrd/attendance",
        icon: Clock,
        label: hrdSidebarLabels.attendance,
      },
      {
        href: "/hrd/alerts",
        icon: AlertTriangle,
        label: hrdSidebarLabels.alerts,
      },
    ],
  },
  {
    heading: "Penggajian",
    items: [
      {
        href: "/hrd/payroll",
        icon: Wallet,
        label: hrdSidebarLabels.payrollWeekly,
      },
      {
        href: "/hrd/payroll-monthly",
        icon: CalendarRange,
        label: hrdSidebarLabels.payrollMonthly,
      },
      {
        href: "/hrd/piece-rates",
        icon: Scale,
        label: hrdSidebarLabels.pieceRates,
      },
      {
        href: "/hrd/loans",
        icon: HandCoins,
        label: hrdSidebarLabels.loans,
      },
    ],
  },
  {
    heading: "Kepegawaian",
    items: [
      {
        href: "/dashboard/employees",
        icon: Users,
        label: hrdSidebarLabels.employees,
      },
      {
        href: "/hrd/leave",
        icon: CalendarDays,
        label: hrdSidebarLabels.leave,
      },
      {
        href: "/hrd/disciplinary",
        icon: Gavel,
        label: hrdSidebarLabels.disciplinary,
      },
    ],
  },
];

export function HrdSidebar({ user, permissions }: HrdSidebarProps) {
  const filteredGroups = filterNavGroups(hrdLinks, permissions);
  return (
    <PortalSidebarBase user={user} portalName="HRD" accentColor="rose">
      <div className="px-3 mb-2">
        <AdminBackButton />
      </div>
      {filteredGroups.map((group) => (
        <PortalNavGroup
          key={group.heading}
          heading={group.heading}
          items={group.items}
          accentColor="rose"
        />
      ))}
    </PortalSidebarBase>
  );
}
