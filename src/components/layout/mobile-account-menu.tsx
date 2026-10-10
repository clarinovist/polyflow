'use client';

import { ChevronDown, LayoutGrid, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { TenantSwitcher } from './tenant-switcher';
import type { CentralWorkspaceOption } from '@/lib/auth/central-workspaces';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

interface MobileAccountMenuProps {
    user: {
        name?: string | null;
        role?: string | null;
        image?: string | null;
        avatarUrl?: string | null;
    };
    onLogout?: () => void | Promise<void>;
    accentColor?: string;
    currentTenantId?: string;
    currentTenantName?: string;
    workspaces?: CentralWorkspaceOption[];
    workspacesUnavailable?: boolean;
    centralLoginHint?: boolean;
    hideAccountLink?: boolean;
    hidePortalLink?: boolean;
}

export function MobileAccountMenu({
    user,
    onLogout,
    accentColor = 'bg-primary',
    currentTenantId,
    currentTenantName,
    workspaces = [],
    workspacesUnavailable = false,
    centralLoginHint = false,
    hideAccountLink = false,
    hidePortalLink = false,
}: MobileAccountMenuProps) {
    const handleLogout = async () => {
        if (onLogout) {
            await onLogout();
        } else {
            await signOut({ callbackUrl: '/login' });
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Menu akun ${user.name || 'User'}`}
                    className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
                >
                    <Avatar className="h-6 w-6 shrink-0">
                        {(user.image || user.avatarUrl) && (
                            <AvatarImage
                                src={(user.image || user.avatarUrl)!}
                                alt={user.name || 'User'}
                                className="object-cover"
                            />
                        )}
                        <AvatarFallback
                            className={`${accentColor} text-white text-xs font-medium`}
                        >
                            {user.name
                                ? user.name.charAt(0).toUpperCase()
                                : 'U'}
                        </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[100px] truncate text-xs sm:inline">
                        {user.name || 'User'}
                    </span>
                    <ChevronDown className="hidden h-3 w-3 shrink-0 text-muted-foreground sm:block" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={4}
                className="w-64 max-w-[calc(100vw-2rem)] p-2"
            >
                <div className="flex items-center gap-3 rounded-lg p-2">
                    <Avatar className="h-9 w-9 shrink-0">
                        {(user.image || user.avatarUrl) && (
                            <AvatarImage
                                src={(user.image || user.avatarUrl)!}
                                alt={user.name || 'User'}
                                className="object-cover"
                            />
                        )}
                        <AvatarFallback
                            className={`${accentColor} text-white text-sm font-medium`}
                        >
                            {user.name
                                ? user.name.charAt(0).toUpperCase()
                                : 'U'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                            {user.name || 'User'}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">
                            {user.role || 'User'}
                        </p>
                    </div>
                </div>
                {(!hideAccountLink || !hidePortalLink) && (
                    <nav
                        aria-label="Navigasi akun"
                        className="mt-1 space-y-1 border-t border-border pt-1"
                    >
                        {!hideAccountLink && (
                            <Link
                                href="/mobile/account"
                                className="flex min-h-11 items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <UserRound className="h-4 w-4" />
                                Akun Saya
                            </Link>
                        )}
                        {!hidePortalLink && (
                            <Link
                                href="/mobile"
                                className="flex min-h-11 items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <LayoutGrid className="h-4 w-4" />
                                Pilih Portal
                            </Link>
                        )}
                    </nav>
                )}
                {(currentTenantName || workspacesUnavailable) && (
                    <div className="mt-1 space-y-2 border-t border-border px-1 py-3">
                        {currentTenantName && (
                            <>
                                <p className="px-1 text-xs font-medium text-muted-foreground">
                                    {workspaces.length > 1
                                        ? 'Ganti perusahaan'
                                        : 'Perusahaan aktif'}
                                </p>
                                <TenantSwitcher
                                    currentTenantId={currentTenantId}
                                    currentTenantName={currentTenantName}
                                    workspaces={workspaces}
                                    centralLoginHint={centralLoginHint}
                                />
                            </>
                        )}
                        {workspacesUnavailable && (
                            <p
                                role="status"
                                className="px-1 text-xs text-muted-foreground"
                            >
                                Daftar perusahaan belum tersedia. Muat ulang
                                halaman untuk mencoba lagi.
                            </p>
                        )}
                    </div>
                )}
                <div className="border-t border-border mt-1 pt-1">
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <LogOut className="h-4 w-4" />
                        Keluar
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
