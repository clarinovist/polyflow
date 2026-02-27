'use client';

import {
    Building2,
    Sparkles,
    Shield,
    Settings,
    LogOut,
    Moon,
    Sun,
    Menu,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/theme-provider';
import { useState } from 'react';

interface AdminNavProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    }
}

const adminLinks = [
    { title: "Tenants", href: "/admin/super-admin", icon: Building2 },
    { title: "AI Assistant", href: "/admin/database-assistant", icon: Sparkles },
    // Add more admin-only tools here in the future like global logs or server health
];

export function AdminNav({ user }: AdminNavProps) {
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

    const ThemeIcon = theme === 'system' ? (resolvedTheme === 'dark' ? Moon : Sun) : (theme === 'dark' ? Moon : Sun);

    return (
        <>
            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background px-4 flex items-center shadow-sm">
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="p-2 -ml-2 mr-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Menu className="h-6 w-6" />
                </button>
                <div className="flex items-center gap-2">
                    <PolyFlowLogo showText={true} size="sm" />
                    <span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200">
                        ADMIN
                    </span>
                </div>
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
                "fixed left-0 top-0 z-50 h-screen w-64 border-r border-border bg-card transition-transform duration-300 shadow-xl lg:shadow-none lg:translate-x-0",
                isMobileOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex h-full flex-col">
                    {/* Logo Area */}
                    <div className="flex h-20 items-center border-b border-border px-6 justify-between bg-zinc-950">
                        <div className="flex items-center gap-3">
                            <Shield className="h-8 w-8 text-red-500" />
                            <div>
                                <h1 className="font-bold text-white text-lg tracking-tight leading-tight">PolyFlow</h1>
                                <p className="text-xs text-red-400 font-semibold tracking-wider uppercase">Master Control</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            className="lg:hidden p-1 text-zinc-400 hover:text-white transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
                        <div className="mb-4">
                            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                System Management
                            </p>
                            {adminLinks.map((item) => {
                                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors font-medium text-sm mb-1",
                                            isActive
                                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <item.icon className={cn("h-4 w-4", isActive ? "text-red-500" : "opacity-80")} />
                                        <span>{item.title}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </nav>

                    {/* User Section */}
                    <div className="border-t border-border p-4 bg-muted/30">
                        <div className="flex items-center gap-3 rounded-lg bg-background p-3 border border-border shadow-sm">
                            <div className="h-9 w-9 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 font-medium text-sm shadow-inner cursor-default">
                                {user.name ? user.name.charAt(0).toUpperCase() : 'A'}
                            </div>
                            <div className="flex-1 overflow-hidden min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{user.name || 'Super Admin'}</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">System Owner</p>
                            </div>

                            <button
                                onClick={cycleTheme}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                title="Toggle theme"
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
