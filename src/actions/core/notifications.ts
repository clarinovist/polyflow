'use server';

import { requireAuth } from '@/lib/tools/auth-checks';
import { NotificationService } from '@/services/core/notification-service';
import { serializeData } from '@/lib/utils/utils';
import { revalidatePath } from 'next/cache';
import { safeAction } from '@/lib/errors/errors';

export const getMyNotifications = async function getMyNotifications(opts?: { take?: number; unreadOnly?: boolean }) {
    return safeAction(async () => {
        const session = await requireAuth();
        const notifications = await NotificationService.getNotifications(session.user.id, opts);
        return serializeData(notifications);
    });
};

export const getUnreadNotificationCount = async function getUnreadNotificationCount() {
    return safeAction(async () => {
        const session = await requireAuth();
        const count = await NotificationService.getUnreadCount(session.user.id);
        return count;
    });
};

export const markNotificationAsRead = async function markNotificationAsRead(id: string) {
    return safeAction(async () => {
        await requireAuth();
        const updated = await NotificationService.markAsRead(id);
        revalidatePath('/', 'layout');
        return serializeData(updated);
    });
};

export const markAllMyNotificationsAsRead = async function markAllMyNotificationsAsRead() {
    return safeAction(async () => {
        const session = await requireAuth();
        await NotificationService.markAllAsRead(session.user.id);
        revalidatePath('/', 'layout');
        return null;
    });
};
