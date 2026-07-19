'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeAction, AuthenticationError } from '@/lib/errors/errors';

/**
 * In-app notification categories the user can toggle. Stored as a JSON map on
 * User.notificationPrefs. Absence of a key means "enabled" (opt-out model).
 */
export const NOTIFICATION_CATEGORIES = [
    { key: 'stock', label: 'Stok & Inventaris' },
    { key: 'purchasing', label: 'Pembelian' },
    { key: 'sales', label: 'Penjualan' },
    { key: 'production', label: 'Produksi' },
    { key: 'finance', label: 'Keuangan' },
    { key: 'system', label: 'Sistem' },
] as const;

export type NotificationPrefs = Record<string, boolean>;

async function requireUserId(): Promise<string> {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) throw new AuthenticationError('Anda harus login.');
    return id;
}

export async function getNotificationPrefs() {
    return safeAction(async () => {
        const userId = await requireUserId();
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { notificationPrefs: true },
        });
        const prefs: NotificationPrefs = {};
        // Default: everything enabled.
        NOTIFICATION_CATEGORIES.forEach((c) => {
            prefs[c.key] = true;
        });
        if (user?.notificationPrefs) {
            try {
                const stored = JSON.parse(user.notificationPrefs) as NotificationPrefs;
                Object.entries(stored).forEach(([k, v]) => {
                    if (k in prefs) prefs[k] = Boolean(v);
                });
            } catch {
                // ignore malformed JSON, keep defaults
            }
        }
        return prefs;
    });
}

const UpdatePrefsSchema = z.record(z.string(), z.boolean());

export async function updateNotificationPrefs(input: NotificationPrefs) {
    return safeAction(async () => {
        const userId = await requireUserId();
        const parsed = UpdatePrefsSchema.parse(input);
        const validKeys = new Set<string>(NOTIFICATION_CATEGORIES.map((c) => c.key));
        const clean: NotificationPrefs = {};
        Object.entries(parsed).forEach(([k, v]) => {
            if (validKeys.has(k)) clean[k] = v;
        });

        await prisma.user.update({
            where: { id: userId },
            data: { notificationPrefs: JSON.stringify(clean) },
        });

        revalidatePath('/dashboard/settings');
        return clean;
    });
}
