import { sendTelegramMessage } from '@/lib/telegram/send-message';

const ALERT_THROTTLE_MS = 60_000;

// globalThis-cached — must survive Next.js SSR chunk duplication like the
// other module-level state in src/lib/core/prisma.ts.
const globalForLeakAlertThrottle = globalThis as unknown as {
    __polyflowLastTenantLeakAlertAt?: number;
};

export type TenantContextLeakDetails = {
    subdomain: string;
    leakedFromTenantId: string;
    resolvedTenantId: string;
};

/**
 * Fire-and-forget alert for a confirmed cross-tenant AsyncLocalStorage
 * context leak (leaked tenant id differs from the tenant id this request
 * actually resolved to). Never throws — a failed or unconfigured alert must
 * never affect tenant resolution.
 * See docs/plan/2026-08-14-tenant-context-leak-investigation.md.
 */
export function alertCrossTenantContextLeak(
    details: TenantContextLeakDetails,
): void {
    const chatId = process.env.TELEGRAM_SYSTEM_ALERT_CHAT_ID;
    if (!chatId) return;

    const now = Date.now();
    const lastAlertAt =
        globalForLeakAlertThrottle.__polyflowLastTenantLeakAlertAt ?? 0;
    if (now - lastAlertAt < ALERT_THROTTLE_MS) return;
    globalForLeakAlertThrottle.__polyflowLastTenantLeakAlertAt = now;

    const message =
        `⚠️ *Tenant context leak terdeteksi*\n` +
        `Subdomain request: \`${details.subdomain}\`\n` +
        `Tenant ID resolved: \`${details.resolvedTenantId}\`\n` +
        `Tenant ID bocor dari context: \`${details.leakedFromTenantId}\`\n` +
        `Waktu: ${new Date(now).toISOString()}`;

    sendTelegramMessage(chatId, message).catch(() => {
        // best-effort — alert failure must never break tenant resolution
    });
}
