'use client';

import { ReactNode, useState, useEffect } from 'react';
import { Menu, X, LogOut, Moon, Sun, Settings, PanelLeftClose, PanelLeftOpen, MessageCircleHeart, BookOpen, AlertTriangle, MessageCircle, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/utils';
import { signOut } from 'next-auth/react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { useTheme } from '@/components/layout/theme-provider';
import { useSidebarCollapse } from '@/components/layout/sidebar-collapse-context';
import { mainNavLabels } from '@/lib/labels';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface PortalSidebarBaseProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
        image?: string | null;
        avatarUrl?: string | null;
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
    const pathname = usePathname();
    const isSupportActive = pathname.startsWith('/support');
    const [helpOpen, setHelpOpen] = useState(isSupportActive);

    useEffect(() => {
        if (isSupportActive) setHelpOpen(true);
    }, [isSupportActive]);

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

                        {/* Help Link - expandable with 3 children */}
                        <div className={isCollapsed ? "pt-2" : "pt-4 mt-auto"}>
                            {isCollapsed ? (
                                <Link
                                    href="/support"
                                    className={cn(
                                        "flex items-center justify-center rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                                        isSupportActive
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                    )}
                                    title="Bantuan"
                                >
                                    <MessageCircleHeart className="h-4 w-4" />
                                </Link>
                            ) : (
                                <div>
                                    <button
                                        onClick={() => setHelpOpen(!helpOpen)}
                                        className={cn(
                                            "flex items-center gap-3 w-full rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                                            isSupportActive
                                                ? "text-primary"
                                                : "text-muted-foreground hover:text-sidebar-foreground"
                                        )}
                                    >
                                        <MessageCircleHeart className="h-4 w-4" />
                                        <span className="flex-1 text-left">{mainNavLabels.help}</span>
                                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", helpOpen && "rotate-180")} />
                                    </button>
                                    {helpOpen && (
                                        <div className="ml-3 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                                            <Link
                                                href="/support"
                                                className={cn(
                                                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                                                    pathname === '/support'
                                                        ? "bg-primary/10 text-primary font-medium"
                                                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                                )}
                                            >
                                                <BookOpen className="h-3.5 w-3.5" />
                                                Cara Pakai
                                            </Link>
                                            <Link
                                                href="/support/troubleshooting"
                                                className={cn(
                                                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                                                    pathname === '/support/troubleshooting'
                                                        ? "bg-primary/10 text-primary font-medium"
                                                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                                )}
                                            >
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                Troubleshooting
                                            </Link>
                                            <Link
                                                href="/support/cs"
                                                className={cn(
                                                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                                                    pathname === '/support/cs'
                                                        ? "bg-primary/10 text-primary font-medium"
                                                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                                )}
                                            >
                                                <MessageCircle className="h-3.5 w-3.5" />
                                                Tanya Virtual CS
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </nav>

                    {/* User Section */}
                    <div className="border-t border-sidebar-border p-3">
                        <div className={cn(
                            "flex items-center rounded-lg bg-sidebar-accent/50 border border-sidebar-border",
                            isCollapsed ? "justify-center p-2" : "gap-3 p-3"
                        )}>
                            <Avatar className="h-9 w-9 shrink-0">
                                {(user.image || user.avatarUrl) && (
                                    <AvatarImage src={(user.image || user.avatarUrl)!} alt={user.name || 'User'} className="object-cover" />
                                )}
                                <AvatarFallback className={cn("text-white font-medium text-sm", avatarColorClass)}>
                                    {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                                </AvatarFallback>
                            </Avatar>
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
