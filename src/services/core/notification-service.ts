import { prisma } from '@/lib/core/prisma';
import { NotificationType, Notification } from '@prisma/client';
import { Resend } from 'resend';
import { logger } from '@/lib/config/logger';

// Configure the external email provider
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

export interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    entityType?: string;
    entityId?: string;
}

export class NotificationService {
    /**
     * Emits a new Notification to the database and optionally dispatches an Email alert.
     */
    static async createNotification({
        userId,
        type,
        title,
        message,
        link,
        entityType,
        entityId,
    }: CreateNotificationInput): Promise<Notification> {
        // 1. Create in-app record
        const notification = await prisma.notification.create({
            data: {
                userId,
                type,
                title,
                message,
                link,
                entityType,
                entityId,
            },
        });

        // 2. Lookup user to see if email dispatch is viable
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
        });

        // 3. Dispatch external email alert asynchronously (don't block the caller)
        if (user?.email && process.env.RESEND_API_KEY) {
            this.sendEmailAlert(user.email, title, message, link).catch(
                (err) => {
                    logger.error(`Failed to dispatch email to ${user.email}`, {
                        error: err,
                        email: user.email,
                        module: 'NotificationService',
                    });
                },
            );
        }

        return notification;
    }

    /**
     * Batch insert technique for bulk alert generation (e.g. system broadcast to all admins)
     */
    static async createBulkNotifications(inputs: CreateNotificationInput[]) {
        if (!inputs.length) return { count: 0 };
        return await prisma.notification.createMany({
            data: inputs,
        });
    }

    /**
     * Throttled bulk insert — skips notifications where a matching
     * (type, userId, entityId) was already created within `withinHours` hours.
     * Used by cron triggers (LOW_STOCK, OVERDUE_AP, OVERDUE_AR) to avoid
     * duplicate alerts within the same day.
     */
    static async createBulkNotificationsThrottled(
        inputs: CreateNotificationInput[],
        withinHours = 24,
    ) {
        if (!inputs.length) return { count: 0 };
        const cutoff = new Date(Date.now() - withinHours * 3600_000);
        const existing = await prisma.notification.findMany({
            where: {
                type: inputs[0].type,
                createdAt: { gte: cutoff },
                OR: inputs.map((i) => ({
                    userId: i.userId,
                    entityId: i.entityId,
                })),
            },
            select: { userId: true, entityId: true },
        });
        const seen = new Set(
            existing.map((e) => `${e.userId}:${e.entityId}`),
        );
        const filtered = inputs.filter(
            (i) => !seen.has(`${i.userId}:${i.entityId}`),
        );
        if (!filtered.length) return { count: 0 };
        return await prisma.notification.createMany({ data: filtered });
    }

    /**
     * Toggle read state
     */
    static async markAsRead(id: string) {
        return await prisma.notification.update({
            where: { id },
            data: { isRead: true },
        });
    }

    static async markAllAsRead(userId: string) {
        return await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
    }

    static async getUnreadCount(userId: string): Promise<number> {
        return await prisma.notification.count({
            where: { userId, isRead: false },
        });
    }

    /**
     * Cursor-based or standard paginated fetching
     */
    static async getNotifications(
        userId: string,
        opts?: { take?: number; skip?: number; unreadOnly?: boolean },
    ) {
        return await prisma.notification.findMany({
            where: {
                userId,
                ...(opts?.unreadOnly ? { isRead: false } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: opts?.take || 50,
            skip: opts?.skip || 0,
        });
    }

    private static async sendEmailAlert(
        to: string,
        subject: string,
        text: string,
        link?: string,
    ) {
        // Construct basic text body since react-email integration is pending
        const body = `${text}\n\nView details: ${process.env.NEXTAUTH_URL || 'https://polyflow.uk'}${link || '/'}`;

        await resend.emails.send({
            from: 'PolyFlow Alerts <onboarding@resend.dev>',
            to,
            subject: `[PolyFlow] ${subject}`,
            text: body,
        });
    }
}
