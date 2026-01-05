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
    User as UserIcon,
    LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';

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

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200 bg-white">
            <div className="flex h-full flex-col">
                {/* Logo */}
                <div className="flex h-16 items-center border-b border-slate-200 px-6">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent italic">
                        PolyFlow ERP
                    </h1>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-4 space-y-6">
                    {sidebarLinks.map((group) => (
                        <div key={group.heading}>
                            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                <div className="border-t border-slate-200 p-4">
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <UserIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-semibold text-slate-900 truncate">{user.name || 'User'}</p>
                            <p className="text-xs text-slate-500 uppercase font-medium">{user.role || 'Warehouse'}</p>
                        </div>
                    </div>

                    <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 transition-colors font-medium mt-2"
                    >
                        <LogOut className="h-5 w-5" />
                        <span>Logout</span>
                    </button>
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
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            )}
        >
            <Icon className={cn("h-4 w-4", isActive ? "text-slate-900" : "text-slate-400")} />
            <span>{label}</span>
        </Link>
    );
}
