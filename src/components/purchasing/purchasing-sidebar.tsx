"use client";

import {
  LayoutDashboard,
  ClipboardList,
  ShoppingCart,
  RotateCcw,
  Truck,
  BarChart3,
  Package,
} from "lucide-react";
import { PortalSidebarBase } from "@/components/layout/portal-sidebar-base";
import { PortalNavGroup } from "@/components/layout/portal-nav-item";
import { AdminBackButton } from "@/components/layout/admin-back-button";
import { purchasingSidebarLabels } from "@/lib/labels";

interface PurchasingSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
}

const purchasingLinks = [
  {
    heading: "Ringkasan",
    items: [
      {
        href: "/purchasing",
        icon: LayoutDashboard,
        label: purchasingSidebarLabels.purchasingDashboard,
      },
    ],
  },
  {
    heading: "Transaksi",
    items: [
      {
        href: "/purchasing/requests",
        icon: ClipboardList,
        label: purchasingSidebarLabels.purchaseRequests,
      },
      {
        href: "/purchasing/orders",
        icon: ShoppingCart,
        label: purchasingSidebarLabels.purchaseOrders,
      },
      {
        href: "/purchasing/returns",
        icon: RotateCcw,
        label: purchasingSidebarLabels.purchaseReturns,
      },
    ],
  },
  {
    heading: "Data Master",
    items: [
      {
        href: "/purchasing/suppliers",
        icon: Truck,
        label: purchasingSidebarLabels.supplierManagement,
      },
    ],
  },
  {
    heading: "Maklon",
    items: [
      {
        href: "/maklon/receipts",
        icon: Package,
        label: "Monitor Penerimaan Maklon",
      },
    ],
  },
  {
    heading: "Analitik",
    items: [
      {
        href: "/purchasing/analytics",
        icon: BarChart3,
        label: purchasingSidebarLabels.procurementAnalytics,
      },
    ],
  },
];

export function PurchasingSidebar({ user }: PurchasingSidebarProps) {
  return (
    <PortalSidebarBase user={user} portalName="Pembelian" accentColor="purple">
      <div className="px-3 mb-2">
        <AdminBackButton />
      </div>
      {purchasingLinks.map((group) => (
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
