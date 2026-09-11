import { createHash } from 'node:crypto';
import { getMainPrisma } from '@/lib/core/prisma';
import { isKillSwitchActive } from '@/lib/telegram/kill-switch';
import type { AssistantResponse } from './assistant-types';

export type BugReportStatus =
    | 'SENT'
    | 'THROTTLED'
    | 'UNAVAILABLE'
    | 'FAILED'
    | 'UNKNOWN';
export const BUG_REPORT_NOTICES: Record<BugReportStatus, string> = {
    SENT: 'Notifikasi dugaan bug terkirim ke Telegram support. Tim support masih perlu memverifikasinya.',
    THROTTLED:
        'Notifikasi Telegram dibatasi satu percobaan per pengguna per jam kalender. Laporan ini tetap tercatat untuk review support; notifikasi baru tidak dikirim.',
    UNAVAILABLE:
        'Notifikasi Telegram belum tersedia. Simpan detail reproduksi dan hubungi admin/support melalui kanal perusahaan.',
    FAILED: 'Notifikasi Telegram gagal dikirim. Hubungi admin/support melalui kanal perusahaan; jangan anggap laporan sudah diterima di Telegram.',
    UNKNOWN:
        'Status pengiriman Telegram belum dapat dipastikan. Tidak ada pengiriman ulang otomatis untuk mencegah duplikasi; hubungi admin/support bila mendesak.',
};

type ReportIdentity = { tenantId: string; userId: string };

/** This server-only notifier accepts no text or destination from the user/LLM.
 * Call only after session verification and HelpInteraction persistence.
 * At-most-one attempt per tenant/user/calendar hour across SSE/JSON and workers.
 * A reserved attempt is never automatically retried, even after an ambiguous timeout.
 */
export async function reportAssistantBug(
    interactionId: string,
    identity: ReportIdentity,
): Promise<BugReportStatus> {
    const chatId = process.env.TELEGRAM_ASSISTANT_BUG_REPORT_CHAT_ID;
    // Dedicated credential: never reuse the interactive Mini App bot. The
    // support group may authorize a different bot and rotating this secret
    // must not affect Telegram login/webhook flows.
    const token = process.env.TELEGRAM_ASSISTANT_BUG_REPORT_BOT_TOKEN;
    if (
        process.env.ASSISTANT_BUG_REPORTS_ENABLED !== 'true' ||
        isKillSwitchActive() ||
        !chatId ||
        !/^-?\d+$/.test(chatId) ||
        !token ||
        !identity.tenantId ||
        !identity.userId ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(interactionId)
    )
        return 'UNAVAILABLE';

    try {
        const db = getMainPrisma();
        const interaction = await db.helpInteraction.findFirst({
            where: {
                id: interactionId,
                ...identity,
                channel: 'web',
                outcome: 'ESCALATED',
                conversationId: { not: null },
            },
            select: { id: true },
        });
        if (!interaction) return 'UNAVAILABLE';

        const dedupKey = createHash('sha256')
            .update(
                JSON.stringify([
                    'assistant-bug-report',
                    identity.tenantId,
                    identity.userId,
                    Math.floor(Date.now() / 3_600_000),
                ]),
            )
            .digest('hex');
        // createMany(skipDuplicates) is an atomic unique-key reservation, not a
        // racy read-then-upsert. FAILED + PENDING is conservative if the process dies.
        const reservation = await db.telegramNotificationLog.createMany({
            data: [
                {
                    ...identity,
                    dedupKey,
                    type: 'ASSISTANT_BUG_REPORT',
                    telegramChatId: chatId,
                    summary: `PENDING_NO_RETRY:${interactionId}`,
                    status: 'FAILED',
                },
            ],
            skipDuplicates: true,
        });
        if (reservation.count === 0) return 'THROTTLED';

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        let status: BugReportStatus = 'UNKNOWN';
        let messageId: string | undefined;
        try {
            const response = await fetch(
                `https://api.telegram.org/bot${token}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        chat_id: chatId,
                        // Allowlisted static text + a server-created opaque reference.
                        // No parse_mode, raw question, answer, URL, tenant or person data.
                        text: `Polyflow — dugaan bug UI\nStatus: perlu verifikasi support, bukan bug terkonfirmasi.\nDasar: pengguna melaporkan reproduksi berulang dan perbedaan hasil.\nReferensi laporan: ${interactionId}\nDetail: buka Admin > Help > Conversations, detail ID tersebut. Akses super-admin diperlukan.\nIsi chat dan data transaksi tidak dikirim ke Telegram.`,
                    }),
                },
            );
            if (!response.ok) {
                status = 'FAILED';
            } else {
                const data = (await response.json()) as {
                    ok?: boolean;
                    result?: { message_id?: number };
                };
                if (
                    data.ok === true &&
                    Number.isSafeInteger(data.result?.message_id) &&
                    data.result!.message_id! > 0
                ) {
                    messageId = String(data.result!.message_id);
                    status = 'SENT';
                } else if (data.ok === false) {
                    status = 'FAILED';
                }
            }
        } catch {
            // Do not log transport errors: they can contain the bot token/URL.
            status = 'UNKNOWN';
        } finally {
            clearTimeout(timer);
        }
        await db.telegramNotificationLog.update({
            where: { dedupKey },
            data: {
                status: status === 'SENT' ? 'SENT' : 'FAILED',
                summary: `${status}:${interactionId}`,
                telegramMessageId: messageId,
                sentAt: status === 'SENT' ? new Date() : null,
            },
        });
        return status;
    } catch {
        // No network send without a successful durable reservation; an update
        // failure after send is unknown, never a claim of confirmed delivery.
        return 'UNKNOWN';
    }
}

/** Delivery metadata is separate from the saved assistant answer: history must
 * not retroactively claim delivery that was not confirmed when it was written. */
export async function assistantBugReportNotice(
    response: AssistantResponse,
    interactionId: string | null,
    identity: { tenantId?: string; userId: string },
): Promise<string | undefined> {
    if (response.disposition !== 'ESCALATE' || !response.safety.allowed)
        return undefined;
    if (
        !interactionId ||
        !response.conversationId ||
        response.historySaved !== true
    ) {
        return 'Laporan belum tersimpan lengkap; notifikasi Telegram tidak dikirim. Simpan detail reproduksi dan hubungi admin/support.';
    }
    if (!identity.tenantId) return BUG_REPORT_NOTICES.UNAVAILABLE;
    return BUG_REPORT_NOTICES[
        await reportAssistantBug(interactionId, {
            tenantId: identity.tenantId,
            userId: identity.userId,
        })
    ];
}
