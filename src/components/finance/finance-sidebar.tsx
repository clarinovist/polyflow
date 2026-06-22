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
  Box,
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
    heading: "Insights",
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
        ],
      },
      {
        href: "/finance/bank-reconciliation",
        icon: Landmark,
        label: financeSidebarLabels.bankReconciliation,
      },
      {
        href: "/finance/fixed-assets",
        icon: Box,
        label: financeSidebarLabels.fixedAssets,
      },
      {
        href: "/finance/budgeting",
        icon: TrendingUp,
        label: financeSidebarLabels.budgeting,
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
            href: "/finance/costing/simulator",
            icon: TrendingUp,
            label: financeSidebarLabels.materialSimulator,
          },
          {
            href: "/finance/costing/hpp-calculator",
            icon: TrendingUp,
            label: financeSidebarLabels.hppCalculator,
          },
        ],
      },
    ],
  },
  {
    heading: "Cash Flow",
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
    heading: "Accounting Ledger",
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
    heading: "Financial Reports",
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
        href: "/finance/reports/budget-variance",
        icon: FileText,
        label: financeSidebarLabels.budgetVariance,
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
    heading: "Configuration",
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
