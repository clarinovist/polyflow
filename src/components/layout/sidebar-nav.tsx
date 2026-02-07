'use client';

import { GlobalSearch } from '@/components/GlobalSearch';
import {
    Factory,
    Package,
    Files,
    Settings2,
    Users,
    Settings,
    LogOut,
    Moon,
    Sun,
    LucideIcon,
    Truck,
    ShoppingCart,
    Calculator,
    Menu,
    X,
    PackageSearch,
    Sparkles,
    ChevronRight,
    ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/theme-provider';
import { useState } from 'react';


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
    children?: {
        title: string;
        href: string;
    }[];
}

// Flattened links
export const sidebarLinks: NavItemType[] = [
    { title: "Sales", href: "/sales", icon: ShoppingCart },
    { title: "Planning", href: "/planning", icon: Truck },
    { title: "Production", href: "/production", icon: Factory },
    { title: "Inventory", href: "/warehouse", icon: PackageSearch },
    {
        title: "Accounting",
        href: "/finance",
        icon: Calculator,
        children: [
            { title: "Balance Sheet", href: "/finance/reports/balance-sheet" },
            { title: "Income Statement", href: "/finance/reports/income-statement" },
            { title: "Trial Balance", href: "/finance/reports/trial-balance" },
            { title: "Budget Variance", href: "/finance/reports/budget-variance" },
        ]
    },

    // Master Data
    { title: "Product Catalog", href: "/dashboard/products", icon: Package },
    { title: "BOMs", href: "/dashboard/boms", icon: Files },
    { title: "Machines", href: "/dashboard/machines", icon: Settings2 },
    { title: "Employees", href: "/dashboard/employees", icon: Users },

    // Tools
    { title: "AI Assistant (Beta)", href: "/admin/database-assistant", icon: Sparkles },
];

export function SidebarNav({ user, permissions }: SidebarNavProps) {
    const pathname = usePathname();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Close mobile sidebar on navigation
    const [prevPathname, setPrevPathname] = useState(pathname);
    if (pathname !== prevPathname) {
        setPrevPathname(pathname);
        if (isMobileOpen) {
            setIsMobileOpen(false);
        }
    }

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

    const filteredItems = sidebarLinks.filter(item => {
        if (permissions === 'ALL') return true;
        return permissions.includes(item.href);
    });

    return (
        <>
            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-sidebar-border bg-sidebar px-4 flex items-center">
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="p-2 -ml-2 mr-2 text-muted-foreground hover:text-primary transition-colors"
                >
                    <Menu className="h-6 w-6" />
                </button>
                <Link href="/dashboard">
                    <PolyFlowLogo showText={true} size="sm" />
                </Link>
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
                        <Link href="/dashboard">
                            <PolyFlowLogo showText={true} size="md" />
                        </Link>
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
                    <nav className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
                        {filteredItems.map((item) => (
                            <NavItem
                                key={item.href}
                                item={item}
                                pathname={pathname}
                            />
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

function NavItem({ item, pathname }: { item: NavItemType; pathname: string }) {
    const { href, icon: Icon, title: label, children } = item;
    const isDirectActive = pathname === href || (href !== '/dashboard' && pathname === href);
    const isChildActive = children?.some(child => pathname === child.href);
    const isActive = isDirectActive || isChildActive;

    const [isOpen, setIsOpen] = useState(isChildActive);

    const hasChildren = children && children.length > 0;

    const content = (
        <>
            <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
            <span className="flex-1 truncate">{label}</span>
            {hasChildren && (
                isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            )}
        </>
    );

    const className = cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm w-full text-left",
        isActive && !hasChildren
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : (isActive && hasChildren ? "text-sidebar-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground")
    );

    if (hasChildren) {
        return (
            <div className="space-y-1">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(className, "cursor-pointer")}
                >
                    {content}
                </button>
                {isOpen && (
                    <div className="ml-4 pl-3 border-l border-sidebar-border space-y-1 mt-1">
                        {/* Main portal link as first child if it has children but we want a "Dashboard/Home" link */}
                        <Link
                            href={href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors font-medium text-xs",
                                isDirectActive
                                    ? "bg-sidebar-accent/50 text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                            )}
                        >
                            Overview
                        </Link>
                        {children.map((child) => (
                            <Link
                                key={child.href}
                                href={child.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors font-medium text-xs",
                                    pathname === child.href
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                                )}
                            >
                                {child.title}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <Link href={href} className={className}>
            {content}
        </Link>
    );
}
