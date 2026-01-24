'use client';

import {
    LayoutDashboard,
    Factory,
    LogOut,
    Send,
    Boxes,
    History,
    Moon,
    Sun,
    LucideIcon, Calculator, Clock,
    Users,
    ClipboardCheck
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/theme-provider';

interface ProductionSidebarProps {
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

const productionLinks: SidebarLinkGroup[] = [
    {
        heading: "Floor Management",
        items: [
            { title: "Overview", href: "/production", icon: LayoutDashboard },
            { title: "Machine Board", href: "/production/machines", icon: Factory },
            { title: "Job Dispatcher", href: "/production/dispatch", icon: Send },
        ],
    },
    {
        heading: "Resources & Stock",
        items: [
            { title: "Floor Stock", href: "/production/inventory", icon: Boxes },
            { title: "Team / Shifts", href: "/production/resources", icon: Users },
            { title: "Output Logs", href: "/production/history", icon: History },
            { title: "Production Costing", href: "/production/costing", icon: Calculator },
            { title: "Work Shifts", href: "/production/shifts", icon: Clock },
        ],
    },
    {
        heading: "Tools",
        items: [
            { title: "Operator Kiosk", href: "/kiosk", icon: ClipboardCheck },
        ],
    },
];

export function ProductionSidebar({ user }: ProductionSidebarProps) {
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
                <nav className="flex-1 overflow-y-auto p-4 space-y-6 mt-4">
                    {productionLinks.map((group) => (
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
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* User Section */}
                <div className="border-t border-sidebar-border p-4">
                    <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3 border border-sidebar-border">
                        <div className="h-9 w-9 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0 font-medium text-sm">
                            {user.name ? user.name.charAt(0).toUpperCase() : 'P'}
                        </div>
                        <div className="flex-1 overflow-hidden min-w-0">
                            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name || 'User'}</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">{user.role || 'Production'}</p>
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
    const isActive = pathname === href || (href !== '/production' && pathname.startsWith(href));

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                isActive
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 shadow-sm border border-emerald-100 dark:border-emerald-800/50"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
        >
            <Icon className={cn("h-4 w-4", isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
            <span>{label}</span>
        </Link>
    );
}
