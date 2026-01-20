'use client';

import { GlobalSearch } from '@/components/GlobalSearch';

import {
    LayoutDashboard,
    Warehouse,
    ArrowRightLeft,
    ClipboardList,
    ClipboardCheck,
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
    MonitorPlay,
    Clock,
    Truck,
    ShoppingCart,
    Receipt,
    Download,
    FileText
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
    }
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
        heading: "Inventory Control",
        items: [
            { title: "Stock Status", href: "/dashboard/inventory", icon: Warehouse },
            { title: "Transfers", href: "/dashboard/inventory/transfer", icon: ArrowRightLeft },
            { title: "Adjustments", href: "/dashboard/inventory/adjustment", icon: ClipboardList },

            { title: "Stock Opname", href: "/dashboard/inventory/opname", icon: ClipboardCheck },
            { title: "Stock Aging", href: "/dashboard/inventory/aging", icon: Clock },
            { title: "Analytics", href: "/dashboard/inventory/analytics", icon: BarChart3 },
        ],
    },
    {
        heading: "Sales & Distribution",
        items: [
            { title: "Sales Orders", href: "/dashboard/sales", icon: ShoppingCart },
            { title: "Invoices", href: "/dashboard/sales/invoices", icon: Receipt },
            { title: "Analytics", href: "/dashboard/sales/analytics", icon: BarChart3 },
        ],
    },
    {
        heading: "Procurement",
        items: [
            { title: "Purchase Orders", href: "/dashboard/purchasing/orders", icon: ShoppingCart },
            { title: "Goods Receipts", href: "/dashboard/purchasing/receipts", icon: Download },
            { title: "Purchase Invoices", href: "/dashboard/purchasing/invoices", icon: FileText },
            { title: "Analytics", href: "/dashboard/purchasing/analytics", icon: BarChart3 },
        ],
    },
    {
        heading: "Manufacturing",
        items: [
            { title: "Production Orders", href: "/dashboard/production/orders", icon: Factory },
            { title: "Operator Kiosk", href: "/dashboard/production/kiosk", icon: MonitorPlay },
            { title: "Analytics", href: "/dashboard/production/analytics", icon: BarChart3 },
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
];

// ... (imports remain)

interface SidebarNavProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    },
    permissions: string[] | 'ALL';
}

// ... (types and sidebarLinks remain)

export function SidebarNav({ user, permissions }: SidebarNavProps) {
    const pathname = usePathname();
    const { theme, setTheme, resolvedTheme } = useTheme();

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
        // If ALL/Admin, return everything
        if (permissions === 'ALL') return group;

        // Filter items based on exact match or if permission logic handles prefixes
        // For simplicity, we match the exact href as the resource key
        const filteredItems = group.items.filter(item => permissions.includes(item.href)); // Check if href exists in permissions list

        // If 'Overview' or specific logic needs items to be always visible (e.g. Dashboard), handle here.
        // For now, assume Dashboard is always allowed or handled in permissions seeding.
        // Actually, let's ensure Dashboard is always visible?
        // Or force include '/dashboard' if we want.

        return {
            ...group,
            items: filteredItems
        };
    }).filter(group => group.items.length > 0); // Remove empty groups

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar">
            <div className="flex h-full flex-col">
                {/* Logo */}
                <div className="flex h-16 items-center border-b border-sidebar-border px-6">
                    <PolyFlowLogo showText={true} size="md" />
                </div>

                <div className="px-4 pt-4">
                    <GlobalSearch className="w-full justify-start pl-2" />
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredGroups.map((group) => (
                        <CollapsibleGroup key={group.heading} group={group} pathname={pathname} />
                    ))}
                </nav>

                {/* User Section */}
                <div className="border-t border-sidebar-border p-4">
                    <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3 border border-sidebar-border">
                        <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0 font-medium text-sm">
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
