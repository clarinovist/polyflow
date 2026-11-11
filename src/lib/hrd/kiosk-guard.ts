import { headers } from 'next/headers';
import { rateLimit } from '@/lib/api/rate-limit';

/**
 * Satu ember rate limit untuk semua aksi kiosk publik (absen, izin) per
 * (IP + kode karyawan), supaya aksi baru bukan jalur tambahan menebak PIN.
 */
export const KIOSK_RATE_LIMIT = 5;
export const KIOSK_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const FALLBACK_IP = '127.0.0.1';

export async function getClientIp(): Promise<string> {
    const h = await headers();
    return (
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        h.get('x-real-ip') ||
        FALLBACK_IP
    );
}

/** true bila percobaan masih diizinkan. */
export async function checkKioskRateLimit(
    employeeCode: string,
): Promise<boolean> {
    const ip = await getClientIp();
    const { success } = rateLimit(
        `kiosk:${ip}:${employeeCode}`,
        KIOSK_RATE_LIMIT,
        KIOSK_RATE_WINDOW_MS,
    );
    return success;
}
