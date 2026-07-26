'use client';

import { LogOut, ChevronDown } from 'lucide-react';
import { signOut } from 'next-auth/react';
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
}

export function MobileAccountMenu({
    user,
    onLogout,
    accentColor = 'bg-primary',
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
                <button className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm active:bg-muted transition-colors">
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
                    <span className="max-w-[100px] truncate text-xs">
                        {user.name || 'User'}
                    </span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={4} className="w-56 p-2">
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
                <div className="border-t border-border mt-1 pt-1">
                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Keluar
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
