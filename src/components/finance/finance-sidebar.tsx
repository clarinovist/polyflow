"use client";

import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  FileText,
  BookOpen,
  Settings2,
  Calendar,
  Building2,
  History as HistoryIcon,
  Zap,
  Calculator,
  TrendingUp,
  Wallet,
  Landmark,
} from "lucide-react";
import { PortalSidebarBase } from "@/components/layout/portal-sidebar-base";
import { PortalNavGroup } from "@/components/layout/portal-nav-item";
import { AdminBackButton } from "@/components/layout/admin-back-button";
import { financeSidebarLabels } from "@/lib/labels";
import { filterNavGroups } from "@/lib/auth/permission-match";

interface FinanceSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  /** Fresh rolePermission resources; 'ALL' for tenant admin */
  permissions?: string[] | "ALL";
}

const financeLinks = [
  {
    heading: "Hari Ini",
    items: [
      {
        href: "/finance",
        icon: LayoutDashboard,
        label: financeSidebarLabels.dashboard,
        exact: true,
      },
    ],
  },
  {
    heading: "Operasi Kas",
    items: [
      {
        href: "/finance/petty-cash",
        icon: Wallet,
        label: financeSidebarLabels.pettyCash,
        children: [
          {
            href: "/finance/petty-cash/reports/daily",
            icon: FileText,
            label: financeSidebarLabels.pettyCashDailyReport,
          },
          {
            href: "/finance/petty-cash/reports/cash-opname",
            icon: FileText,
            label: financeSidebarLabels.pettyCashCashOpname,
          },
          {
            href: "/finance/petty-cash/reports/rekap",
            icon: FileText,
            label: financeSidebarLabels.pettyCashRekap,
          },
        ],
      },
      {
        href: "/finance/bank-reconciliation",
        icon: Landmark,
        label: financeSidebarLabels.bankReconciliation,
      },
      {
        href: "/finance/aging",
        icon: HistoryIcon,
        label: financeSidebarLabels.aging,
      },
    ],
  },
  {
    heading: "Piutang & Hutang",
    items: [
      {
        href: "/finance/quick-entry",
        icon: Zap,
        label: financeSidebarLabels.quickEntry,
      },
      {
        href: "/finance/invoices/sales",
        icon: Receipt,
        label: financeSidebarLabels.receivables,
      },
      {
        href: "/finance/payments/received",
        icon: CreditCard,
        label: financeSidebarLabels.customerPayments,
      },
      {
        href: "/finance/invoices/purchase",
        icon: FileText,
        label: financeSidebarLabels.payables,
      },
      {
        href: "/finance/payments/sent",
        icon: CreditCard,
        label: financeSidebarLabels.supplierPayments,
      },
    ],
  },
  {
    heading: "Akuntansi",
    items: [
      {
        href: "/finance/journals",
        icon: BookOpen,
        label: financeSidebarLabels.journalEntries,
      },
      {
        href: "/finance/assets",
        icon: Building2,
        label: financeSidebarLabels.fixedAssets,
      },
      {
        href: "/finance/foh-allocation",
        icon: Calculator,
        label: financeSidebarLabels.fohAllocation,
      },
    ],
  },
  {
    heading: financeSidebarLabels.budgetPlanning,
    items: [
      {
        href: "/finance/budgeting",
        icon: TrendingUp,
        label: financeSidebarLabels.budgeting,
        children: [
          {
            href: "/finance/budgeting/input",
            icon: Wallet,
            label: financeSidebarLabels.budgetInput,
          },
          {
            href: "/finance/budgeting/variance",
            icon: FileText,
            label: financeSidebarLabels.budgetVariance,
          },
        ],
      },
    ],
  },
  {
    heading: "Laporan",
    items: [
      {
        href: "/finance/reports",
        icon: FileText,
        label: financeSidebarLabels.reportsHub,
        exact: true,
      },
    ],
  },
  {
    heading: "Pengaturan",
    items: [
      {
        href: "/finance/coa",
        icon: Settings2,
        label: financeSidebarLabels.chartOfAccounts,
        children: [
          {
            href: "/finance/coa/roles",
            icon: Settings2,
            label: "Role Mapping",
          },
        ],
      },
      {
        href: "/finance/periods",
        icon: Calendar,
        label: financeSidebarLabels.fiscalPeriods,
      },
      {
        href: "/finance/opening-balance",
        icon: HistoryIcon,
        label: financeSidebarLabels.openingBalance,
      },
      {
        href: "/finance/payment-banks",
        icon: Landmark,
        label: financeSidebarLabels.paymentBanks,
      },
    ],
  },
];

export function FinanceSidebar({ user, permissions }: FinanceSidebarProps) {
  const filteredGroups = filterNavGroups(financeLinks, permissions);
  return (
    <PortalSidebarBase user={user} portalName="Portal Keuangan" accentColor="purple">
      <div className="px-3 mb-2">
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
