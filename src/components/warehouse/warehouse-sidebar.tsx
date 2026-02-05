'use client';

import {
    LayoutDashboard,
    Warehouse,
    LogOut,
    PackageSearch,
    ChevronRight,
    ClipboardCheck,
    ArrowLeftRight,
    PackagePlus,
    Clock,
    History,
    Moon,
    Sun,
    LucideIcon,
    Menu,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/theme-provider';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { useState } from 'react';

interface WarehouseSidebarProps {
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

const warehouseLinks: SidebarLinkGroup[] = [
    {
        heading: "Operations",
        items: [
            { title: "Job Queue", href: "/warehouse", icon: LayoutDashboard },
            { title: "Incoming Receipts", href: "/warehouse/incoming", icon: PackageSearch },
            { title: "Outgoing Orders", href: "/warehouse/outgoing", icon: ChevronRight },
        ],
    },
    {
        heading: "Inventory",
        items: [
            { title: "Stock Overview", href: "/warehouse/inventory", icon: Warehouse },
            { title: "Stock Opname", href: "/warehouse/opname", icon: ClipboardCheck },
            { title: "Stock Transfer", href: "/warehouse/inventory/transfer", icon: ArrowLeftRight },
            { title: "Stock Adjustment", href: "/warehouse/inventory/adjustment", icon: PackagePlus },
            { title: "Stock Aging", href: "/warehouse/inventory/aging", icon: Clock },
            { title: "History Logs", href: "/warehouse/inventory/history", icon: History },
        ],
    },
];

export function WarehouseSidebar({ user }: WarehouseSidebarProps) {
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

    const [isMobileOpen, setIsMobileOpen] = useState(false);

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
                <Link href="/warehouse">
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

                    {/* Optional Admin Back Button */}
                    <div className="px-4 pt-4">
                        <AdminBackButton role={user.role || undefined} />
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto p-4 space-y-6 mt-4">
                        {warehouseLinks.map((group) => (
                            <div key={group.heading} className="space-y-2">
                                <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                                    {group.heading}
                                </h3>
                                <div className="space-y-1">
                                    {group.items.map((item) => (
                                        <NavItem
                                            key={item.href}
                                            href={item.href}
                                            icon={item.icon}
                                            label={item.title}
                                            pathname={pathname}
                                            onClick={() => setIsMobileOpen(false)}
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
                                {user.name ? user.name.charAt(0).toUpperCase() : 'W'}
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
        </>
    );
}

function NavItem({ href, icon: Icon, label, pathname, onClick }: { href: string; icon: LucideIcon; label: string; pathname: string; onClick?: () => void }) {
    const isActive = pathname === href || (href !== '/warehouse' && pathname.startsWith(href));

    return (
        <Link
            href={href}
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
        >
            <Icon className={cn("h-4 w-4", isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
            <span>{label}</span>
        </Link>
    );
}
