"use client";

import {
  LayoutDashboard,
  PackageSearch,
  RotateCcw,
  Plus,
  Warehouse,
} from "lucide-react";
import { PortalSidebarBase } from "@/components/layout/portal-sidebar-base";
import { PortalNavGroup } from "@/components/layout/portal-nav-item";
import { AdminBackButton } from "@/components/layout/admin-back-button";
import { maklonSidebarLabels } from "@/lib/labels";
import { filterNavGroups } from "@/lib/auth/permission-match";

interface MaklonSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    image?: string | null;
  };
  permissions?: string[] | "ALL";
}

const maklonLinks = [
  {
    heading: "Ringkasan",
    items: [
      {
        href: "/maklon",
        icon: LayoutDashboard,
        label: maklonSidebarLabels.dashboard,
        exact: true,
      },
    ],
  },
  {
    heading: "Operasi",
    items: [
      {
        href: "/maklon/receipts",
        icon: PackageSearch,
        label: maklonSidebarLabels.receipts,
      },
      {
        href: "/warehouse/incoming/create-maklon",
        icon: Plus,
        label: maklonSidebarLabels.newReceipt,
      },
      {
        href: "/maklon/returns",
        icon: RotateCcw,
        label: maklonSidebarLabels.returns,
      },
      {
        href: "/maklon/returns/create",
        icon: Plus,
        label: maklonSidebarLabels.newReturn,
      },
    ],
  },
  {
    heading: "Terkait",
    items: [
      {
        href: "/warehouse",
        icon: Warehouse,
        label: maklonSidebarLabels.warehousePortal,
      },
    ],
  },
];

export function MaklonSidebar({ user, permissions }: MaklonSidebarProps) {
  const filteredGroups = filterNavGroups(maklonLinks, permissions);
  return (
    <PortalSidebarBase user={user} portalName="Maklon" accentColor="amber">
      <div className="px-3 mb-2">
        <AdminBackButton />
      </div>
      {filteredGroups.map((group) => (
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
