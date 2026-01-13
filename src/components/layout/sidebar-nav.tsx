'use client';

import {
    LayoutDashboard,
    Warehouse,
    ArrowRightLeft,
    ClipboardList,
    ClipboardCheck,
    History,
    Factory,
    Package,
    Files,
    Settings2,
    Users,
    Clock,
    Settings,
    LogOut,
    Moon,
    Sun,
    BarChart3,
    LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/theme-provider';

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
            { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
        ],
    },
    {
        heading: "Inventory Control",
        items: [
            { title: "Stock Status", href: "/dashboard/inventory", icon: Warehouse },
            { title: "Transfers", href: "/dashboard/inventory/transfer", icon: ArrowRightLeft },
            { title: "Adjustments", href: "/dashboard/inventory/adjustment", icon: ClipboardList },
            { title: "Stock Opname", href: "/dashboard/inventory/opname", icon: ClipboardCheck },
            { title: "History Logs", href: "/dashboard/inventory/history", icon: History },
        ],
    },
    {
        heading: "Manufacturing",
        items: [
            { title: "Production Orders", href: "/dashboard/production/orders", icon: Factory },
        ],
    },
    {
        heading: "Master Data",
        items: [
            { title: "Product Catalog", href: "/dashboard/products", icon: Package },
            { title: "Bill of Materials", href: "/dashboard/production/boms", icon: Files },
            { title: "Work Shifts", href: "/dashboard/settings/shifts", icon: Clock },
            { title: "Machines", href: "/dashboard/production/resources/machines", icon: Settings2 },
            { title: "Employees", href: "/dashboard/production/resources/employees", icon: Users },
        ],
    },
    {
        heading: "System",
        items: [
            { title: "Settings", href: "/dashboard/settings", icon: Settings },
        ],
    },
];

export function SidebarNav({ user }: SidebarNavProps) {
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

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar">
            <div className="flex h-full flex-col">
                {/* Logo */}
                <div className="flex h-16 items-center border-b border-sidebar-border px-6">
                    <PolyFlowLogo showText={true} size="md" />
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-4 space-y-6">
                    {sidebarLinks.map((group) => (
                        <div key={group.heading}>
                            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {group.heading}
                            </h2>
                            <div className="space-y-1">
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

function NavItem({ href, icon: Icon, label, pathname }: { href: string; icon: LucideIcon; label: string; pathname: string }) {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
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
