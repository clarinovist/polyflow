'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    getMyNotifications,
    getUnreadNotificationCount,
    markAllMyNotificationsAsRead,
    markNotificationAsRead
} from '@/actions/notifications';
import Link from 'next/link';
import { NotificationType } from '@prisma/client';

interface NotificationItem {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    isRead: boolean;
    entityType: string | null;
    entityId: string | null;
    createdAt: Date;
    link: string | null;
}

export function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false);

    // Fetch unread count, revalidating on focus to keep it snappy without costly polling
    const { data: count, mutate: mutateCount } = useSWR(
        'notificationCount', 
        () => getUnreadNotificationCount(), 
        { revalidateOnFocus: true, refreshInterval: 60000 }
    );

    // Fetch notifications only if the popover is open or data doesn't exist yet
    const { data: notifications, mutate: mutateNotifications, isLoading } = useSWR(
        isOpen ? 'notificationList' : null, 
        () => getMyNotifications({ take: 20 }),
        { revalidateOnFocus: true }
    );

    const handleMarkAsRead = async (id: string, currentlyUnread: boolean) => {
        if (!currentlyUnread) return;
        
        // Optimistic UI updates
        mutateCount((prev: number | undefined) => Math.max(0, (prev || 0) - 1), false);
        mutateNotifications(
            (prev: NotificationItem[] | undefined) => prev?.map((n) => n.id === id ? { ...n, isRead: true } : n),
            false
        );

        await markNotificationAsRead(id);
        
        // Final sync
        mutateCount();
        mutateNotifications();
    };

    const handleMarkAllRead = async () => {
        if (!count || count === 0) return;

        // Optimistic
        mutateCount(0, false);
        mutateNotifications(
            (prev: NotificationItem[] | undefined) => prev?.map((n) => ({ ...n, isRead: true })),
            false
        );

        await markAllMyNotificationsAsRead();
        
        // Final sync
        mutateCount();
        mutateNotifications();
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <Bell className="h-5 w-5 text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
                    {count !== undefined && count > 0 && (
                        <Badge 
                            variant="destructive" 
                            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
                        >
                            {count > 99 ? '99+' : count}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[380px] p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="font-semibold text-sm">Notifications</div>
                    {count !== undefined && count > 0 && (
                        <Button 
                            variant="ghost" 
                            className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                            onClick={handleMarkAllRead}
                        >
                            <Check className="h-3 w-3 mr-1" />
                            Mark all read
                        </Button>
                    )}
                </div>
                
                <ScrollArea className="h-[400px]">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
                            Loading...
                        </div>
                    ) : notifications && notifications.length > 0 ? (
                        <div className="flex flex-col">
                            {notifications.map((notif: NotificationItem) => (
                                <div 
                                    key={notif.id}
                                    onClick={() => handleMarkAsRead(notif.id, !notif.isRead)}
                                    className={`
                                        flex flex-col gap-1 p-4 border-b last:border-0 cursor-pointer transition-colors
                                        ${!notif.isRead ? 'bg-zinc-50 dark:bg-zinc-900' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}
                                    `}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="font-medium text-sm leading-tight pr-4">
                                            {notif.title}
                                        </div>
                                        {!notif.isRead && (
                                            <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-500 mt-1 flex-shrink-0" />
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 pr-2">
                                        {notif.message}
                                    </p>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-[10px] text-muted-foreground/70 font-mono">
                                            {new Date(notif.createdAt).toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                        {notif.link && (
                                            <Link href={notif.link} className="text-xs text-primary hover:underline">
                                                View Details
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center text-sm text-muted-foreground space-y-3">
                            <Bell className="h-8 w-8 text-zinc-300 opacity-50" />
                            <p>You&apos;re all caught up!<br/>No new notifications.</p>
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
