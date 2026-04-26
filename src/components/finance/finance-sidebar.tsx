'use client';

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
    CircleDollarSign
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';

interface FinanceSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    };
}

const financeLinks = [
    {
        heading: 'Insights',
        items: [
            { href: '/finance', icon: LayoutDashboard, label: 'Dashboard', exact: true },
            { href: '/finance/petty-cash', icon: Wallet, label: 'Petty Cash' },
            { href: '/finance/bank-reconciliation', icon: Landmark, label: 'Bank Reconciliation' },
            { href: '/finance/fixed-assets', icon: Box, label: 'Fixed Assets' },
            { href: '/finance/budgeting', icon: TrendingUp, label: 'Budgeting vs Actuals' },
            { href: '/finance/aging', icon: HistoryIcon, label: 'AR/AP Aging Summary' },
            { href: '/finance/foh-allocation', icon: TrendingUp, label: 'FOH Allocation' },
            { href: '/finance/costing', icon: TrendingUp, label: 'Costing Dashboard' },
            { href: '/finance/costing/simulator', icon: TrendingUp, label: 'Material Simulator' },
            { href: '/finance/costing/hpp-calculator', icon: TrendingUp, label: 'HPP Calculator' },
        ],
    },
    {
        heading: 'Cash Flow',
        items: [
            { href: '/finance/quick-entry', icon: Zap, label: 'Quick Entry' },
            { href: '/finance/invoices/sales', icon: Receipt, label: 'Receivables' },
            { href: '/sales/orders?view=mts-unpaid', icon: CircleDollarSign, label: 'MTS Belum Lunas' },
            { href: '/finance/payments/received', icon: CreditCard, label: 'Customer Payments' },
            { href: '/finance/invoices/purchase', icon: FileText, label: 'Payables' },
            { href: '/finance/payments/sent', icon: CreditCard, label: 'Supplier Payments' },
        ],
    },
    {
        heading: 'Accounting Ledger',
        items: [
            { href: '/finance/journals', icon: BookOpen, label: 'Journal Entries' },
            { href: '/finance/assets', icon: Building2, label: 'Fixed Assets' },
        ],
    },
    {
        heading: 'Financial Reports',
        items: [
            { href: '/finance/reports/balance-sheet', icon: FileText, label: 'Balance Sheet' },
            { href: '/finance/reports/income-statement', icon: FileText, label: 'Income Statement' },
            { href: '/finance/reports/cash-flow', icon: FileText, label: 'Cash Flow Statement' },
            { href: '/finance/reports/trial-balance', icon: FileText, label: 'Trial Balance' },
            { href: '/finance/reports/budget-variance', icon: FileText, label: 'Budget Variance' },
            { href: '/finance/reports/tax', icon: FileText, label: 'Tax Report' },
            { href: '/finance/reports/maklon', icon: Factory, label: 'Maklon Profitability' },
        ],
    },
    {
        heading: 'Configuration',
        items: [
            { href: '/finance/coa', icon: Settings2, label: 'Chart of Accounts' },
            { href: '/finance/periods', icon: Calendar, label: 'Fiscal Periods' },
            { href: '/finance/opening-balance', icon: HistoryIcon, label: 'Opening Balance Setup' },
        ],
    },
];

export function FinanceSidebar({ user }: FinanceSidebarProps) {
    return (
        <PortalSidebarBase user={user} portalName="Finance" accentColor="purple">
            <div className="px-3 mb-2">
                <AdminBackButton role={user.role || undefined} />
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
