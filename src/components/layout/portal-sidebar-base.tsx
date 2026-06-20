'use client';

import { ReactNode, useState } from 'react';
import { Menu, X, LogOut, Moon, Sun, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/layout/theme-provider';
import { useSidebarCollapse } from '@/components/layout/sidebar-collapse-context';

interface PortalSidebarBaseProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    };
    portalName: string;
    accentColor?: 'primary' | 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
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
    const { isCollapsed, toggle: toggleCollapse } = useSidebarCollapse();

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
            <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-sidebar-border bg-sidebar px-4 flex items-center gap-4">
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="p-2 -ml-2 text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Open sidebar"
                >
                    <Menu className="h-6 w-6" />
                </button>
                <PolyFlowLogo showText={true} size="sm" />
            </header>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar aside */}
            <aside className={cn(
                "fixed left-0 top-0 z-50 h-screen border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:translate-x-0",
                isCollapsed ? "w-16" : "w-64",
                isMobileOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex h-full flex-col">
                    {/* Logo & Close Button (Mobile) */}
                    <div className={cn(
                        "flex h-16 items-center border-b border-sidebar-border justify-between",
                        isCollapsed ? "px-3" : "px-6"
                    )}>
                        {isCollapsed ? (
                            <PolyFlowLogo showText={false} size="sm" />
                        ) : (
                            <PolyFlowLogo showText={true} size="md" />
                        )}
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            className="lg:hidden p-1 text-muted-foreground hover:text-primary transition-colors"
                            aria-label="Close sidebar"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Collapse Toggle (desktop only) */}
                    <div className="hidden lg:flex justify-end px-2 pt-2">
                        <button
                            onClick={toggleCollapse}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {isCollapsed
                                ? <PanelLeftOpen className="h-4 w-4" />
                                : <PanelLeftClose className="h-4 w-4" />
                            }
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className={cn(
                        "flex-1 overflow-y-auto space-y-6 mt-2 custom-scrollbar",
                        isCollapsed ? "px-2 py-4" : "p-4"
                    )}>
                        {children}
                    </nav>

                    {/* User Section */}
                    <div className="border-t border-sidebar-border p-3">
                        <div className={cn(
                            "flex items-center rounded-lg bg-sidebar-accent/50 border border-sidebar-border",
                            isCollapsed ? "justify-center p-2" : "gap-3 p-3"
                        )}>
                            <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0 font-medium text-sm", avatarColorClass)}>
                                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            {!isCollapsed && (
                                <div className="flex-1 overflow-hidden min-w-0">
                                    <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name || 'User'}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">{portalName}</p>
                                </div>
                            )}
                            {!isCollapsed && (
                                <>
                                    <button
                                        onClick={cycleTheme}
                                        className="text-muted-foreground hover:text-primary transition-colors p-1"
                                        title={`Theme: ${theme}`}
                                        aria-label="Toggle theme"
                                    >
                                        <ThemeIcon className="h-4 w-4" />
                                    </button>
                                    <Link
                                        href="/dashboard/settings"
                                        className="text-muted-foreground hover:text-primary transition-colors p-1"
                                        title="Settings"
                                        aria-label="Settings"
                                    >
                                        <Settings className="h-4 w-4" />
                                    </Link>
                                    <button
                                        onClick={() => signOut({ callbackUrl: '/login' })}
                                        className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                                        title="Logout"
                                        aria-label="Sign out"
                                    >
                                        <LogOut className="h-4 w-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Spacer for Mobile Header */}
            <div className="h-16 lg:hidden" />
        </>
    );
}
