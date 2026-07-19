/**
 * In-app notification categories the user can toggle. Stored as a JSON map on
 * User.notificationPrefs. Absence of a key means "enabled" (opt-out model).
 *
 * Deliberately kept OUT of a 'use server' file: server action modules may
 * only export async functions (Next.js constraint) — exporting this const
 * array from notification-actions.ts crashes the module at runtime with
 * "A 'use server' file can only export async functions, found object."
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
