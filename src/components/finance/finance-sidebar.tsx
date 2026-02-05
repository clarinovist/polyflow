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
    BarChart3,
    Calculator,
    History
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
        heading: 'Overview',
        items: [
            { href: '/finance', icon: LayoutDashboard, label: 'Financial Dashboard' },
        ],
    },
    {
        heading: 'Receivables (AR)',
        items: [
            { href: '/finance/invoices/sales', icon: Receipt, label: 'Sales Invoices' },
            { href: '/finance/payments/received', icon: CreditCard, label: 'Customer Payments' },
        ],
    },
    {
        heading: 'Payables (AP)',
        items: [
            { href: '/finance/invoices/purchase', icon: FileText, label: 'Purchase Invoices' },
            { href: '/finance/payments/sent', icon: CreditCard, label: 'Supplier Payments' },
        ],
    },
    {
        heading: 'Accounting',
        items: [
            { href: '/finance/journals', icon: BookOpen, label: 'Journal Entries' },
            { href: '/finance/coa', icon: Settings2, label: 'Chart of Accounts' },
            { href: '/finance/periods', icon: Calendar, label: 'Fiscal Periods' },
            { href: '/finance/assets', icon: Building2, label: 'Fixed Assets' },
            { href: '/dashboard/finance/opening-balance', icon: History, label: 'Opening Balance Setup' },
            { href: '/finance/budget', icon: BarChart3, label: 'Budgeting' },
        ],
    },
    {
        heading: 'Reports',
        items: [
            { href: '/finance/reports', icon: FileText, label: 'Financial Reports' },
            { href: '/finance/costing', icon: Calculator, label: 'Costing Dashboard' },
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
