'use client';

import { GlobalSearch } from '@/components/GlobalSearch';

import {
    LayoutDashboard,
    Factory,
    Package,
    Files,
    Settings2,
    Users,
    Users2,
    Settings,
    LogOut,
    Moon,
    Sun,
    BarChart3,
    LucideIcon,
    ChevronDown,
    ChevronRight,
    Truck,
    ShoppingCart,
    Receipt,
    FileText,
    Calculator,
    Menu,
    X
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/theme-provider';
import { useState, useEffect } from 'react';

interface SidebarNavProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    },
    permissions: string[] | 'ALL';
}

interface NavItemType {
    title: string;
    href: string;
    icon: LucideIcon;
}

interface SidebarLinkGroup {
    heading: string;
    items: NavItemType[];
}

export const sidebarLinks: SidebarLinkGroup[] = [
    {
        heading: "Overview",
        items: [
            { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        ],
    },
    {
        heading: "Sales & Distribution",
        items: [
            { title: "Quotations", href: "/dashboard/sales/quotations", icon: FileText },
            { title: "Sales Orders", href: "/dashboard/sales", icon: ShoppingCart },
            { title: "Invoices", href: "/dashboard/sales/invoices", icon: Receipt },
            { title: "Sales Analytics", href: "/dashboard/sales/analytics", icon: BarChart3 },
        ],
    },
    {
        heading: "Procurement",
        items: [
            { title: "Purchase Orders", href: "/dashboard/purchasing/orders", icon: ShoppingCart },
            { title: "Purchase Invoices", href: "/dashboard/purchasing/invoices", icon: FileText },
            { title: "Procurement Analytics", href: "/dashboard/purchasing/analytics", icon: BarChart3 },
        ],
    },
    {
        heading: "PPIC & Manufacturing",
        items: [
            { title: "Production Orders", href: "/dashboard/production/orders", icon: Factory },
            { title: "Production Schedule", href: "/dashboard/ppic/schedule", icon: BarChart3 },
            { title: "Material Planning", href: "/dashboard/ppic/mrp", icon: FileText },
            { title: "Production Analytics", href: "/dashboard/production/analytics", icon: BarChart3 },
        ],
    },
    {
        heading: "Inventory",
        items: [
            { title: "Inventory Analysis", href: "/dashboard/inventory", icon: BarChart3 },
        ],
    },
    {
        heading: "Master Data",
        items: [
            { title: "Product Catalog", href: "/dashboard/products", icon: Package },
            { title: "Bill of Materials", href: "/dashboard/production/boms", icon: Files },
            { title: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
            { title: "Customers", href: "/dashboard/customers", icon: Users2 },
            { title: "Machines", href: "/dashboard/production/resources/machines", icon: Settings2 },
            { title: "Employees", href: "/dashboard/production/resources/employees", icon: Users },
        ],
    },
    {
        heading: "Finance & Accounting",
        items: [
            { title: "Cost Accounting", href: "/dashboard/finance/costing", icon: Calculator },
        ],
    },
];

export function SidebarNav({ user, permissions }: SidebarNavProps) {
    const pathname = usePathname();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Close mobile sidebar on navigation
    useEffect(() => {
        // eslint-disable-next-line 
        setIsMobileOpen(false);
    }, [pathname]);

    const cycleTheme = () => {
        if (theme === 'light') setTheme('dark');
        else if (theme === 'dark') setTheme('system');
        else setTheme('light');
    };

    const getThemeLabel = () => {
        if (theme === 'system') return 'System';
        return theme === 'light' ? 'Light' : 'Dark';
    };

    const ThemeIcon = theme === 'system' ? (resolvedTheme === 'dark' ? Moon : Sun) : (theme === 'dark' ? Moon : Sun);

    const filteredGroups = sidebarLinks.map(group => {
        if (permissions === 'ALL') return group;
        const filteredItems = group.items.filter(item => permissions.includes(item.href));
        return {
            ...group,
            items: filteredItems
        };
    }).filter(group => group.items.length > 0);

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

            {/* Sidebar Aside */}
            <aside className={cn(
                "fixed left-0 top-0 z-50 h-screen w-64 border-r border-sidebar-border bg-sidebar transition-transform duration-300 lg:translate-x-0",
                isMobileOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex h-full flex-col">
                    {/* Logo & Close Button (Mobile) */}
                    <div className="flex h-16 items-center border-b border-sidebar-border px-6 justify-between">
                        <PolyFlowLogo showText={true} size="md" />
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            className="lg:hidden p-1 text-muted-foreground hover:text-primary transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="px-4 pt-4">
                        <GlobalSearch className="w-full justify-start pl-2" />
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {filteredGroups.map((group) => (
                            <CollapsibleGroup key={group.heading} group={group} pathname={pathname} />
                        ))}
                    </nav>

                    {/* User Section */}
                    <div className="border-t border-sidebar-border p-4">
                        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3 border border-sidebar-border">
                            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0 font-medium text-sm text-white">
                                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div className="flex-1 overflow-hidden min-w-0">
                                <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name || 'User'}</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">{user.role || 'Warehouse'}</p>
                            </div>
                            <Link
                                href="/dashboard/settings"
                                className="text-muted-foreground hover:text-primary transition-colors p-1"
                                title="Settings"
                            >
                                <Settings className="h-4 w-4" />
                            </Link>
                            <button
                                onClick={cycleTheme}
                                className="text-muted-foreground hover:text-primary transition-colors p-1"
                                title={`Theme: ${getThemeLabel()}`}
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

            {/* Spacer for Mobile Header */}
            <div className="h-16 lg:hidden" />
        </>
    );
}

function CollapsibleGroup({ group, pathname }: { group: SidebarLinkGroup, pathname: string }) {
    // Check if any child is active
    const isChildActive = group.items.some(item =>
        pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
    );

    // Auto-expand if child is active, otherwise default to expanded for 'Overview' or collapsed for others
    const [isOpen, setIsOpen] = useState(isChildActive || group.heading === 'Overview');

    useEffect(() => {
        if (isChildActive) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsOpen(true);
        }
    }, [pathname, isChildActive]);

    if (group.items.length === 0) return null;

    return (
        <div className="space-y-1">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
                {group.heading}
                {isOpen ? (
                    <ChevronDown className="h-3 w-3" />
                ) : (
                    <ChevronRight className="h-3 w-3" />
                )}
            </button>
            <div className={cn("space-y-1 overflow-hidden transition-all", isOpen ? "block" : "hidden")}>
                {group.items.map((item) => (
                    <NavItem
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        label={item.title}
                        pathname={pathname}
                    />
                ))}
            </div>
        </div>
    );
}

function NavItem({ href, icon: Icon, label, pathname }: { href: string; icon: LucideIcon; label: string; pathname: string }) {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm ml-2", // Added ml-2 for hierarchy visual
                isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
        >
            <Icon className={cn("h-4 w-4", isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
            <span>{label}</span>
        </Link>
    );
}
