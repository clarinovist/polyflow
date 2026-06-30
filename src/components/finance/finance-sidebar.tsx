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
  TrendingUp,
  Wallet,
  Landmark,
  Factory,
} from "lucide-react";
import { PortalSidebarBase } from "@/components/layout/portal-sidebar-base";
import { PortalNavGroup } from "@/components/layout/portal-nav-item";
import { AdminBackButton } from "@/components/layout/admin-back-button";
import { financeSidebarLabels } from "@/lib/labels";

interface FinanceSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
}

const financeLinks = [
  {
    heading: "Operasi",
    items: [
      {
        href: "/finance",
        icon: LayoutDashboard,
        label: financeSidebarLabels.dashboard,
        exact: true,
      },
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
      {
        href: "/finance/foh-allocation",
        icon: TrendingUp,
        label: financeSidebarLabels.fohAllocation,
      },
      {
        href: "/finance/costing",
        icon: TrendingUp,
        label: financeSidebarLabels.costingDashboard,
        children: [
          {
            href: "/finance/costing/hpp-report",
            icon: FileText,
            label: financeSidebarLabels.hppReport,
          },
        ],
      },
    ],
  },
  {
    heading: "Arus Kas",
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
    ],
  },
  {
    heading: financeSidebarLabels.budgetPlanning,
    items: [
      {
        href: "/finance/budgeting",
        icon: TrendingUp,
        label: financeSidebarLabels.budgeting,
        exact: true,
      },
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
  {
    heading: "Laporan Keuangan",
    items: [
      {
        href: "/finance/reports/balance-sheet",
        icon: FileText,
        label: financeSidebarLabels.balanceSheet,
      },
      {
        href: "/finance/reports/income-statement",
        icon: FileText,
        label: financeSidebarLabels.incomeStatement,
      },
      {
        href: "/finance/reports/cash-flow",
        icon: FileText,
        label: financeSidebarLabels.cashFlowStatement,
      },
      {
        href: "/finance/reports/trial-balance",
        icon: FileText,
        label: financeSidebarLabels.trialBalance,
      },
      {
        href: "/finance/reports/general-ledger",
        icon: BookOpen,
        label: financeSidebarLabels.generalLedger,
      },
      {
        href: "/finance/reports/tax",
        icon: FileText,
        label: financeSidebarLabels.taxReport,
      },
      {
        href: "/finance/reports/maklon",
        icon: Factory,
        label: financeSidebarLabels.maklonProfitability,
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
    ],
  },
];

export function FinanceSidebar({ user }: FinanceSidebarProps) {
  return (
    <PortalSidebarBase user={user} portalName="Finance" accentColor="purple">
      <div className="px-3 mb-2">
        <AdminBackButton />
      </div>
      {financeLinks.map((group) => (
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
