# Workspace Portal Refactoring - Implementation Plan

**Goal:** Restructure the ERP application into 6 dedicated role-based portals to reduce sidebar clutter, eliminate redundancy, and provide tailored user experiences.

**Architecture:** Create 3 new portals (`/sales`, `/finance`, `/planning`) with dedicated sidebars, refactor existing `/dashboard` to lean executive view, and enhance existing `/warehouse` and `/production` portals with additional features.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, NextAuth.js, Prisma

---

## Portal Overview

| Portal | Route | Roles | Status |
|--------|-------|-------|--------|
| Admin Dashboard | `/dashboard` | ADMIN | Refactor (lean down) |
| Warehouse | `/warehouse` | WAREHOUSE | Enhance (add Inventory Analysis) |
| Production | `/production` | PRODUCTION | Enhance (add Costing, Work Shifts) |
| Sales | `/sales` | SALES | **NEW** |
| Finance | `/finance` | FINANCE | **NEW** |
| Planning | `/planning` | PPIC, PROCUREMENT | **NEW** |

---

## Phase 0: Preparation (Foundation)

### Task 0.1: Create Shared Sidebar Components

**Goal:** Extract common sidebar patterns to avoid code duplication across 6 portals.

**Files:**
- Create: `src/components/layout/portal-sidebar-base.tsx`
- Create: `src/components/layout/portal-nav-item.tsx`
- Create: `src/components/layout/portal-user-section.tsx`

**Step 1:** Create base sidebar component with common structure

```tsx
// src/components/layout/portal-sidebar-base.tsx
'use client';

import { ReactNode, useState } from 'react';
import { Menu, X, LogOut, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/theme-provider';

interface PortalSidebarBaseProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  portalName: string;
  accentColor?: string; // e.g., 'emerald', 'blue', 'purple'
  children: ReactNode;
}

export function PortalSidebarBase({ 
  user, 
  portalName, 
  accentColor = 'primary',
  children 
}: PortalSidebarBaseProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const ThemeIcon = theme === 'system' 
    ? (resolvedTheme === 'dark' ? Moon : Sun) 
    : (theme === 'dark' ? Moon : Sun);

  const avatarColorClass = {
    primary: 'bg-primary',
    emerald: 'bg-emerald-600',
    blue: 'bg-blue-600',
    purple: 'bg-purple-600',
    amber: 'bg-amber-600',
    rose: 'bg-rose-600',
  }[accentColor] || 'bg-primary';

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-sidebar-border bg-sidebar px-4 flex items-center justify-between">
        <PolyFlowLogo showText={true} size="sm" />
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-50 h-screen w-64 border-r border-sidebar-border bg-sidebar transition-transform duration-300 lg:translate-x-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full flex-col">
          {/* Logo & Close */}
          <div className="flex h-16 items-center border-b border-sidebar-border px-6 justify-between">
            <PolyFlowLogo showText={true} size="md" />
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-1 text-muted-foreground hover:text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-6 mt-2 custom-scrollbar">
            {children}
          </nav>

          {/* User Section */}
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3 border border-sidebar-border">
              <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0 font-medium text-sm", avatarColorClass)}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex-1 overflow-hidden min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name || 'User'}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">{portalName}</p>
              </div>
              <button
                onClick={cycleTheme}
                className="text-muted-foreground hover:text-primary transition-colors p-1"
                title={`Theme: ${theme}`}
              >
                <ThemeIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Spacer */}
      <div className="h-16 lg:hidden" />
    </>
  );
}
```

**Step 2:** Create reusable NavGroup and NavItem components

```tsx
// src/components/layout/portal-nav-item.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  accentColor?: string;
}

interface NavGroupProps {
  heading: string;
  items: NavItemProps[];
  accentColor?: string;
  defaultOpen?: boolean;
}

export function PortalNavItem({ href, icon: Icon, label, accentColor = 'primary' }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  const activeClasses = {
    primary: 'bg-sidebar-accent text-sidebar-accent-foreground',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 border border-rose-100 dark:border-rose-800/50',
  }[accentColor] || 'bg-sidebar-accent text-sidebar-accent-foreground';

  const iconActiveClasses = {
    primary: 'text-sidebar-accent-foreground',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
  }[accentColor] || 'text-sidebar-accent-foreground';

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
        isActive
          ? activeClasses
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4", isActive ? iconActiveClasses : "text-muted-foreground")} />
      <span>{label}</span>
    </Link>
  );
}

export function PortalNavGroup({ heading, items, accentColor = 'primary', defaultOpen = true }: NavGroupProps) {
  const pathname = usePathname();
  const isChildActive = items.some(item => 
    pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
  );
  const [isOpen, setIsOpen] = useState(defaultOpen || isChildActive);

  if (items.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {heading}
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      <div className={cn("space-y-1 overflow-hidden transition-all ml-2", isOpen ? "block" : "hidden")}>
        {items.map((item) => (
          <PortalNavItem key={item.href} {...item} accentColor={accentColor} />
        ))}
      </div>
    </div>
  );
}
```

**Step 3:** Run build to verify no errors

```bash
npm run build
```
Expected: Build passes

**Step 4:** Commit

```bash
git add src/components/layout/portal-*.tsx
git commit -m "feat: add shared portal sidebar base components"
```

---

### Task 0.2: Update Auth Redirect Logic

**Goal:** Ensure login redirects users to their correct portal based on role.

**Files:**
- Modify: `src/actions/auth.actions.ts`

**Step 1:** Update redirect mapping

```typescript
// In src/actions/auth.actions.ts, update the role-based redirect function

function getRoleBasedRedirectUrl(role: string): string {
  switch (role) {
    case 'ADMIN':
      return '/dashboard';
    case 'WAREHOUSE':
      return '/warehouse';
    case 'PRODUCTION':
      return '/production';
    case 'SALES':
      return '/sales';
    case 'FINANCE':
      return '/finance';
    case 'PPIC':
    case 'PROCUREMENT':
      return '/planning';
    default:
      return '/dashboard';
  }
}
```

**Step 2:** Commit

```bash
git add src/actions/auth.actions.ts
git commit -m "feat: update auth redirect for new portals"
```

---

## Phase 1: Create New Portal Infrastructure

### Task 1.1: Create Sales Portal Layout & Sidebar

**Goal:** Build `/sales` portal with dedicated sidebar for Sales role.

**Files:**
- Create: `src/app/[locale]/sales/layout.tsx`
- Create: `src/components/sales/sales-sidebar.tsx`

**Step 1:** Create Sales Sidebar

```tsx
// src/components/sales/sales-sidebar.tsx
'use client';

import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Truck,
  Users2,
  BarChart3
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';

interface SalesSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
}

const salesLinks = [
  {
    heading: 'Overview',
    items: [
      { href: '/sales', icon: LayoutDashboard, label: 'Sales Dashboard' },
    ],
  },
  {
    heading: 'Transactions',
    items: [
      { href: '/sales/quotations', icon: FileText, label: 'Quotations' },
      { href: '/sales/orders', icon: ShoppingCart, label: 'Sales Orders' },
      { href: '/sales/deliveries', icon: Truck, label: 'Delivery Tracking' },
    ],
  },
  {
    heading: 'Customers',
    items: [
      { href: '/sales/customers', icon: Users2, label: 'Customer Management' },
    ],
  },
  {
    heading: 'Analytics',
    items: [
      { href: '/sales/analytics', icon: BarChart3, label: 'Sales Analytics' },
    ],
  },
];

export function SalesSidebar({ user }: SalesSidebarProps) {
  return (
    <PortalSidebarBase user={user} portalName="Sales" accentColor="blue">
      {salesLinks.map((group) => (
        <PortalNavGroup
          key={group.heading}
          heading={group.heading}
          items={group.items}
          accentColor="blue"
        />
      ))}
    </PortalSidebarBase>
  );
}
```

**Step 2:** Create Sales Layout

```tsx
// src/app/[locale]/sales/layout.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { SalesSidebar } from '@/components/sales/sales-sidebar';

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Only allow SALES and ADMIN roles
  if (session.user.role !== 'SALES' && session.user.role !== 'ADMIN') {
    redirect('/login?error=Unauthorized');
  }

  return (
    <div className="min-h-screen bg-background">
      <SalesSidebar user={session.user} />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Step 3:** Create placeholder page

```tsx
// src/app/[locale]/sales/page.tsx
export default function SalesDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sales Dashboard</h1>
      <p className="text-muted-foreground">Welcome to the Sales Portal</p>
    </div>
  );
}
```

**Step 4:** Run build and verify

```bash
npm run build
```

**Step 5:** Commit

```bash
git add src/app/[locale]/sales/ src/components/sales/
git commit -m "feat: create sales portal infrastructure"
```

---

### Task 1.2: Create Finance Portal Layout & Sidebar

**Goal:** Build `/finance` portal with dedicated sidebar for Finance role.

**Files:**
- Create: `src/app/[locale]/finance/layout.tsx`
- Create: `src/components/finance/finance-sidebar.tsx`

**Step 1:** Create Finance Sidebar

```tsx
// src/components/finance/finance-sidebar.tsx
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
  Calculator
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';

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
```

**Step 2:** Create Finance Layout

```tsx
// src/app/[locale]/finance/layout.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { FinanceSidebar } from '@/components/finance/finance-sidebar';

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Only allow FINANCE and ADMIN roles
  if (session.user.role !== 'FINANCE' && session.user.role !== 'ADMIN') {
    redirect('/login?error=Unauthorized');
  }

  return (
    <div className="min-h-screen bg-background">
      <FinanceSidebar user={session.user} />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Step 3:** Create placeholder page

```tsx
// src/app/[locale]/finance/page.tsx
export default function FinanceDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financial Dashboard</h1>
      <p className="text-muted-foreground">Welcome to the Finance Portal</p>
    </div>
  );
}
```

**Step 4:** Commit

```bash
git add src/app/[locale]/finance/ src/components/finance/
git commit -m "feat: create finance portal infrastructure"
```

---

### Task 1.3: Create Planning Portal Layout & Sidebar

**Goal:** Build `/planning` portal for PPIC and Procurement roles.

**Files:**
- Create: `src/app/[locale]/planning/layout.tsx`
- Create: `src/components/planning/planning-sidebar.tsx`

**Step 1:** Create Planning Sidebar

```tsx
// src/components/planning/planning-sidebar.tsx
'use client';

import {
  LayoutDashboard,
  Factory,
  Calendar,
  FileText,
  ShoppingCart,
  Truck,
  BarChart3
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';

interface PlanningSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
}

const planningLinks = [
  {
    heading: 'Overview',
    items: [
      { href: '/planning', icon: LayoutDashboard, label: 'Planning Dashboard' },
    ],
  },
  {
    heading: 'Production Planning',
    items: [
      { href: '/planning/orders', icon: Factory, label: 'Production Orders' },
      { href: '/planning/schedule', icon: Calendar, label: 'Production Schedule' },
      { href: '/planning/mrp', icon: FileText, label: 'Material Requirements' },
    ],
  },
  {
    heading: 'Procurement',
    items: [
      { href: '/planning/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
      { href: '/planning/suppliers', icon: Truck, label: 'Supplier Management' },
    ],
  },
  {
    heading: 'Analytics',
    items: [
      { href: '/planning/production-analytics', icon: BarChart3, label: 'Production Analytics' },
      { href: '/planning/procurement-analytics', icon: BarChart3, label: 'Procurement Analytics' },
    ],
  },
];

export function PlanningSidebar({ user }: PlanningSidebarProps) {
  return (
    <PortalSidebarBase user={user} portalName="Planning" accentColor="amber">
      {planningLinks.map((group) => (
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
```

**Step 2:** Create Planning Layout

```tsx
// src/app/[locale]/planning/layout.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PlanningSidebar } from '@/components/planning/planning-sidebar';

export default async function PlanningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Allow PPIC, PROCUREMENT, and ADMIN roles
  const allowedRoles = ['PPIC', 'PROCUREMENT', 'ADMIN'];
  if (!allowedRoles.includes(session.user.role || '')) {
    redirect('/login?error=Unauthorized');
  }

  return (
    <div className="min-h-screen bg-background">
      <PlanningSidebar user={session.user} />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Step 3:** Create placeholder page

```tsx
// src/app/[locale]/planning/page.tsx
export default function PlanningDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Planning Dashboard</h1>
      <p className="text-muted-foreground">Welcome to the Planning Portal (PPIC & Procurement)</p>
    </div>
  );
}
```

**Step 4:** Commit

```bash
git add src/app/[locale]/planning/ src/components/planning/
git commit -m "feat: create planning portal infrastructure"
```

---

## Phase 2: Migrate Existing Pages to New Portals

### Task 2.1: Migrate Sales Pages

**Goal:** Move/duplicate sales-related pages from `/dashboard/sales/*` to `/sales/*`

**Files:**
- Copy: `src/app/[locale]/dashboard/sales/quotations/` → `src/app/[locale]/sales/quotations/`
- Copy: `src/app/[locale]/dashboard/sales/` → `src/app/[locale]/sales/orders/`
- Copy: `src/app/[locale]/dashboard/sales/invoices/` → handled by Finance portal
- Copy: `src/app/[locale]/dashboard/sales/analytics/` → `src/app/[locale]/sales/analytics/`
- Copy: `src/app/[locale]/dashboard/customers/` → `src/app/[locale]/sales/customers/`

**Note:** Adjust imports and navigation links in copied files to use new paths.

---

### Task 2.2: Migrate Finance Pages

**Goal:** Move/duplicate finance-related pages to `/finance/*`

**Files:**
- Copy: `src/app/[locale]/dashboard/sales/invoices/` → `src/app/[locale]/finance/invoices/sales/`
- Copy: `src/app/[locale]/dashboard/purchasing/invoices/` → `src/app/[locale]/finance/invoices/purchase/`
- Copy: `src/app/[locale]/dashboard/accounting/journals/` → `src/app/[locale]/finance/journals/`
- Copy: `src/app/[locale]/dashboard/accounting/coa/` → `src/app/[locale]/finance/coa/`
- Copy: `src/app/[locale]/dashboard/accounting/periods/` → `src/app/[locale]/finance/periods/`
- Copy: `src/app/[locale]/dashboard/accounting/assets/` → `src/app/[locale]/finance/assets/`
- Copy: `src/app/[locale]/dashboard/accounting/budget/` → `src/app/[locale]/finance/budget/`
- Copy: `src/app/[locale]/dashboard/accounting/reports/` → `src/app/[locale]/finance/reports/`
- Copy: `src/app/[locale]/dashboard/finance/costing/` → `src/app/[locale]/finance/costing/`

---

### Task 2.3: Migrate Planning Pages

**Goal:** Move/duplicate planning-related pages to `/planning/*`

**Files:**
- Copy: `src/app/[locale]/dashboard/production/orders/` → `src/app/[locale]/planning/orders/`
- Copy: `src/app/[locale]/dashboard/ppic/schedule/` → `src/app/[locale]/planning/schedule/`
- Copy: `src/app/[locale]/dashboard/ppic/mrp/` → `src/app/[locale]/planning/mrp/`
- Copy: `src/app/[locale]/dashboard/purchasing/orders/` → `src/app/[locale]/planning/purchase-orders/`
- Copy: `src/app/[locale]/dashboard/suppliers/` → `src/app/[locale]/planning/suppliers/`
- Copy: `src/app/[locale]/dashboard/production/analytics/` → `src/app/[locale]/planning/production-analytics/`
- Copy: `src/app/[locale]/dashboard/purchasing/analytics/` → `src/app/[locale]/planning/procurement-analytics/`

---

## Phase 3: Refactor Admin Dashboard (Lean Down)

### Task 3.1: Update Admin Sidebar to Executive View

**Goal:** Remove transactional items from admin sidebar, keep only executive overview and configuration.

**Files:**
- Modify: `src/components/layout/sidebar-nav.tsx`

**New Admin Sidebar Structure:**

```typescript
export const sidebarLinks: SidebarLinkGroup[] = [
  {
    heading: "sidebar.overview",
    items: [
      { title: "sidebar.dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    heading: "sidebar.analytics",
    items: [
      { title: "sidebar.salesAnalytics", href: "/dashboard/analytics/sales", icon: BarChart3 },
      { title: "sidebar.prodAnalytics", href: "/dashboard/analytics/production", icon: BarChart3 },
      { title: "sidebar.invAnalysis", href: "/dashboard/analytics/inventory", icon: BarChart3 },
      { title: "sidebar.procAnalytics", href: "/dashboard/analytics/procurement", icon: BarChart3 },
      { title: "sidebar.costing", href: "/dashboard/analytics/costing", icon: Calculator },
    ],
  },
  {
    heading: "sidebar.masterData",
    items: [
      { title: "sidebar.productCatalog", href: "/dashboard/products", icon: Package },
      { title: "sidebar.boms", href: "/dashboard/production/boms", icon: Files },
      { title: "sidebar.machines", href: "/dashboard/production/resources/machines", icon: Settings2 },
      { title: "sidebar.employees", href: "/dashboard/production/resources/employees", icon: Users },
      { title: "sidebar.suppliers", href: "/dashboard/suppliers", icon: Truck },
      { title: "sidebar.customers", href: "/dashboard/customers", icon: Users2 },
    ],
  },
  {
    heading: "sidebar.administration",
    items: [
      { title: "sidebar.users", href: "/dashboard/settings", icon: Users },
      { title: "sidebar.workShifts", href: "/dashboard/settings/shifts", icon: Clock },
      { title: "sidebar.settings", href: "/dashboard/settings/general", icon: Settings },
    ],
  },
];
```

---

### Task 3.2: Add Quick Portal Switcher to Admin

**Goal:** Add links to switch between portals from Admin dashboard.

**Files:**
- Modify: GlobalSearch or create new PortalSwitcher component

---

## Phase 4: Enhance Existing Portals

### Task 4.1: Add Inventory Analysis to Warehouse Portal

**Files:**
- Modify: `src/components/warehouse/warehouse-sidebar.tsx`
- Copy analysis page to: `src/app/[locale]/warehouse/analytics/`

---

### Task 4.2: Add Costing & Work Shifts to Production Portal

**Files:**
- Modify: `src/components/production/production-sidebar.tsx`
- Copy costing page to: `src/app/[locale]/production/costing/`
- Copy shifts page to: `src/app/[locale]/production/shifts/`

---

## Phase 5: Verification & Cleanup

### Task 5.1: Test All Portal Access by Role

**Verification Matrix:**

| Role | /dashboard | /warehouse | /production | /sales | /finance | /planning |
|------|------------|------------|-------------|--------|----------|-----------|
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| WAREHOUSE | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| PRODUCTION | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| SALES | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| FINANCE | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| PPIC | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| PROCUREMENT | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

**Test Commands:**
```bash
npm run build
npm run lint
npm run test
```

---

### Task 5.2: Update Navigation Links Throughout App

**Goal:** Ensure all internal links point to correct portal routes.

---

### Task 5.3: Remove Deprecated Pages (Optional)

**Goal:** After verifying portals work, optionally remove duplicated pages from `/dashboard/*` that are no longer needed there.

**Note:** Keep pages in Admin Dashboard that serve as "view-only" analytics for executive visibility.

---

## Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| Phase 0 | Shared Components & Auth | 2-3 hours |
| Phase 1 | Create 3 New Portals | 3-4 hours |
| Phase 2 | Migrate Pages | 4-6 hours |
| Phase 3 | Refactor Admin Dashboard | 2-3 hours |
| Phase 4 | Enhance Existing Portals | 1-2 hours |
| Phase 5 | Verification & Cleanup | 2-3 hours |

**Total Estimated: 14-21 hours**

---

## Implementation Order (Recommended)

1. ✅ Phase 0: Foundation (must do first)
2. ➡️ Phase 1.2: Finance Portal (daily journaling is urgent)
3. ➡️ Phase 1.3: Planning Portal (core manufacturing)
4. ➡️ Phase 1.1: Sales Portal
5. ➡️ Phase 3: Admin Dashboard lean-down
6. ➡️ Phase 2: Page migrations
7. ➡️ Phase 4: Portal enhancements
8. ➡️ Phase 5: Verification
