import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { hasTenantModuleDirect } from '@/lib/modules/tenant-entitlements';
import {
    getPilotSubdomain,
    isKillSwitchActive,
} from '@/lib/telegram/kill-switch';
import { sendTelegramMessage } from '@/lib/telegram/send-message';
import { resolveAllowedResources } from '@/lib/telegram/permissions';
import { logTelegramAudit } from '@/lib/telegram/audit';
import {
    buildDedupKey,
    isDuplicate,
    recordNotificationAttempt,
} from '@/lib/telegram/notification-dedup';
import {
    detectCriticalStock,
    detectStuckSalesOrders,
    detectOverdueAr,
    detectOverdueAp,
    detectProductionNoProgress,
} from './detectors';
import { emptyDetectionResult, type DetectionResult } from './detection-types';
import {
    formatDigestMarkdown,
    toDigestFindings,
    type DigestFinding,
} from './format';
import { isFeatureEnabled } from '@/lib/bot/feature-flags';

export type DigestResult = {
    findings: DigestFinding[];
    recipients: number;
    sent: number;
    skipped: number;
    failed: number;
};

async function getPilotTenant() {
    try {
        const main = getMainPrisma();
        const pilotSub = getPilotSubdomain();
        const tenant = await main.tenant.findUnique({
            where: { subdomain: pilotSub },
        });
        if (!tenant?.dbUrl) return null;
        return { tenantId: tenant.id, tenantDb: getTenantDb(tenant.dbUrl) };
    } catch {
        return null;
    }
}

function isInQuietHours(
    pref: {
        quietHoursStart: number | null;
        quietHoursEnd: number | null;
    } | null,
    timezone: string,
): boolean {
    if (pref?.quietHoursStart == null || pref?.quietHoursEnd == null)
        return false;

    const now = new Date();
    const hour = Number(
        now.toLocaleString('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: timezone,
        }),
    );

    const start = pref.quietHoursStart;
    const end = pref.quietHoursEnd;

    if (start <= end) {
        return hour >= start && hour < end;
    }
    // overnight window (e.g. 22 → 6)
    return hour >= start || hour < end;
}

export async function runDigest(): Promise<DigestResult> {
    const empty: DigestResult = {
        findings: [],
        recipients: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
    };

    if (!isFeatureEnabled('assistant.proactiveDigest')) {
        return empty;
    }

    if (isKillSwitchActive()) {
        logTelegramAudit({
            action: 'NOTIF_SKIPPED',
            outcome: 'SKIPPED_KILL_SWITCH',
            details: { route: 'digest' },
        });
        return empty;
    }

    const pilot = await getPilotTenant();
    if (!pilot) {
        console.error('[DIGEST] pilot tenant not found');
        return empty;
    }

    const { tenantId, tenantDb } = pilot;

    // No ambient tenantIdContext here (pilot tenant resolved directly, not
    // via withTenant), so use the direct/tenantId-explicit entitlement check.
    const [
        inventoryEntitled,
        salesEntitled,
        financeEntitled,
        productionEntitled,
    ] = await Promise.all([
        hasTenantModuleDirect(tenantId, 'INVENTORY'),
        hasTenantModuleDirect(tenantId, 'SALES'),
        hasTenantModuleDirect(tenantId, 'FINANCE'),
        hasTenantModuleDirect(tenantId, 'PRODUCTION'),
    ]);

    const skippedModules = [
        !inventoryEntitled && 'INVENTORY',
        !salesEntitled && 'SALES',
        !financeEntitled && 'FINANCE',
        !productionEntitled && 'PRODUCTION',
    ].filter((m): m is string => m !== false);
    if (skippedModules.length > 0) {
        console.log(
            `[DIGEST] Skipping detectors for non-entitled modules: ${skippedModules.join(', ')}`,
        );
    }

    // 1. Run all entitled detectors in parallel. Detectors resolve their own
    // internal errors into { status: 'failed' } rather than rejecting, but
    // allSettled stays as defense-in-depth against anything that still throws.
    const results = await Promise.allSettled([
        inventoryEntitled
            ? detectCriticalStock(tenantDb)
            : Promise.resolve(
                  emptyDetectionResult('critical_stock', [
                      '/warehouse/inventory',
                  ]),
              ),
        salesEntitled
            ? detectStuckSalesOrders(tenantDb)
            : Promise.resolve(
                  emptyDetectionResult('stuck_so', ['/sales/orders']),
              ),
        financeEntitled
            ? detectOverdueAr(tenantDb)
            : Promise.resolve(
                  emptyDetectionResult('overdue_ar', ['/finance/invoices']),
              ),
        financeEntitled
            ? detectOverdueAp(tenantDb)
            : Promise.resolve(
                  emptyDetectionResult('overdue_ap', ['/purchasing/invoices']),
              ),
        productionEntitled
            ? detectProductionNoProgress(tenantDb)
            : Promise.resolve(
                  emptyDetectionResult('production_no_progress', [
                      '/production/orders',
                  ]),
              ),
    ]);

    const detectionResults: DetectionResult[] = [];
    for (const r of results) {
        if (r.status === 'fulfilled') {
            detectionResults.push(r.value);
            if (r.value.status === 'failed') {
                console.error(
                    `[DIGEST] detector ${r.value.detector} failed:`,
                    r.value.error,
                );
            }
        } else {
            console.error('[DIGEST] detector rejected:', r.reason);
        }
    }

    const findings: DigestFinding[] = toDigestFindings(detectionResults);

    if (findings.length === 0) {
        return empty;
    }

    // 2. Get recipients: ACTIVE TelegramIdentity + pref enabled && dailyDigest
    const identities = await tenantDb.telegramIdentity.findMany({
        where: { status: 'ACTIVE', telegramChatId: { not: null } },
        select: {
            userId: true,
            telegramUserId: true,
            telegramChatId: true,
        },
    });

    if (identities.length === 0) return { ...empty, findings };

    const recipientUserIds = identities.map((i) => i.userId);
    const prefs = await tenantDb.telegramNotificationPreference.findMany({
        where: { userId: { in: recipientUserIds } },
    });

    const prefMap = new Map(prefs.map((p) => [p.userId, p]));

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // 3. Process each recipient
    for (const identity of identities) {
        const pref = prefMap.get(identity.userId);

        // Skip if notifications disabled or dailyDigest disabled
        if (pref && (!pref.enabled || pref.dailyDigest === false)) {
            skipped++;
            logTelegramAudit({
                action: 'NOTIF_SKIPPED',
                telegramUserId: identity.telegramUserId,
                userId: identity.userId,
                tenantId,
                outcome: 'PREF_DISABLED',
                details: { route: 'digest' },
            });
            continue;
        }

        const timezone = pref?.timezone || 'Asia/Jakarta';

        // Quiet hours check
        if (pref && isInQuietHours(pref, timezone)) {
            skipped++;
            logTelegramAudit({
                action: 'NOTIF_SKIPPED',
                telegramUserId: identity.telegramUserId,
                userId: identity.userId,
                tenantId,
                outcome: 'SKIPPED_QUIET',
                details: { route: 'digest' },
            });
            continue;
        }

        // Permission filter
        const allowed = await resolveAllowedResources(identity.userId);
        const filtered = findings.filter((f) => {
            if (allowed === 'ALL') return true;
            return f.requiredResources.some((r) => allowed.includes(r));
        });

        if (filtered.length === 0) {
            skipped++;
            logTelegramAudit({
                action: 'NOTIF_SKIPPED',
                telegramUserId: identity.telegramUserId,
                userId: identity.userId,
                tenantId,
                outcome: 'NO_RELEVANT_FINDINGS',
                details: { route: 'digest' },
            });
            continue;
        }

        // Dedup check
        const today = new Date().toLocaleDateString('sv-SE', {
            timeZone: timezone,
        });
        const dedupKey = buildDedupKey({
            tenantId,
            type: 'daily_digest',
            scope: `${identity.userId}:${today}`,
        });

        if (await isDuplicate(dedupKey)) {
            skipped++;
            logTelegramAudit({
                action: 'NOTIF_SKIPPED',
                telegramUserId: identity.telegramUserId,
                userId: identity.userId,
                tenantId,
                outcome: 'DEDUP',
                details: { route: 'digest' },
            });
            continue;
        }

        // Format and send
        const message = formatDigestMarkdown(filtered, { timezone });
        if (!message) {
            skipped++;
            continue;
        }

        const result = await sendTelegramMessage(
            identity.telegramChatId!,
            message,
        );

        // Record dedup AFTER send attempt (per plan: idempotent on retry)
        await recordNotificationAttempt({
            tenantId,
            userId: identity.userId,
            telegramUserId: identity.telegramUserId || undefined,
            telegramChatId: identity.telegramChatId || undefined,
            dedupKey,
            type: 'daily_digest',
            summary: `${filtered.length} temuan`,
            status: result.ok ? 'SENT' : 'FAILED',
            telegramMessageId: result.ok ? String(result.messageId) : undefined,
        });

        if (result.ok) {
            sent++;
            logTelegramAudit({
                action: 'DIGEST_SENT',
                telegramUserId: identity.telegramUserId,
                userId: identity.userId,
                tenantId,
                outcome: 'SUCCESS',
                details: { findingsCount: filtered.length },
            });
        } else {
            failed++;
            logTelegramAudit({
                action: 'NOTIF_SKIPPED',
                telegramUserId: identity.telegramUserId,
                userId: identity.userId,
                tenantId,
                outcome: 'FAILED',
                details: { error: result.error },
            });
        }
    }

    return { findings, recipients: identities.length, sent, skipped, failed };
}
