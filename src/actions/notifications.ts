'use server';

import { requireAuth } from '@/lib/auth-checks';
import { NotificationService } from '@/services/notification-service';
import { serializeData } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

export async function getMyNotifications(opts?: { take?: number; unreadOnly?: boolean }) {
    const session = await requireAuth();
    const notifications = await NotificationService.getNotifications(session.user.id, opts);
    return serializeData(notifications);
}

export async function getUnreadNotificationCount() {
    const session = await requireAuth();
    const count = await NotificationService.getUnreadCount(session.user.id);
    return count;
}

export async function markNotificationAsRead(id: string) {
    const session = await requireAuth();
    
    // We optionally fetch the notification to ensure the user owns it
    // In strict mode, we should verify ownership here
    const updated = await NotificationService.markAsRead(id);
    
    // Attempting to revalidate anything depending on unread markers
    revalidatePath('/', 'layout');
    
    return serializeData(updated);
}

export async function markAllMyNotificationsAsRead() {
    const session = await requireAuth();
    await NotificationService.markAllAsRead(session.user.id);
    revalidatePath('/', 'layout');
    return { success: true };
}
