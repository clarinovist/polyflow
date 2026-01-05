'use client';

import { Package, Warehouse, BarChart3, Settings, Factory, LogOut, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

interface SidebarNavProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    }
}

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
                <nav className="flex-1 space-y-1 p-4">
                    <NavItem href="/dashboard" icon={BarChart3} label="Dashboard" pathname={pathname} />
                    <NavItem href="/dashboard/products" icon={Package} label="Products" pathname={pathname} />
                    <NavItem href="/dashboard/inventory" icon={Warehouse} label="Inventory" pathname={pathname} />
                    <NavItem href="/dashboard/production" icon={Factory} label="Production" pathname={pathname} />
                </nav>

                {/* User Section & Settings */}
                <div className="border-t border-slate-200 p-4 space-y-2">
                    <NavItem href="/dashboard/settings" icon={Settings} label="Settings" pathname={pathname} />

                    <div className="pt-4 mt-2 border-t border-slate-100">
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
            </div>
        </aside>
    );
}

function NavItem({ href, icon: Icon, label, pathname }: { href: string; icon: any; label: string; pathname: string }) {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium",
                isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            )}
        >
            <Icon className={cn("h-5 w-5", isActive ? "text-slate-900" : "text-slate-400")} />
            <span>{label}</span>
        </Link>
    );
}
