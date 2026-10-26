import { headers } from 'next/headers';

/** Best-effort client address behind the nginx proxy. Use for rate limiting only. */
export async function getClientIp(): Promise<string> {
    const h = await headers();
    return (
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        h.get('x-real-ip') ||
        '127.0.0.1'
    );
}
