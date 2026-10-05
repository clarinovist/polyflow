import { getMainPrisma } from "@/lib/core/prisma";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

// Digest window: proposals created in the last 25h are "new".
// A missed day may resurface an item once; accepted over extra state.
const DIGEST_WINDOW_HOURS = 25;
const MAX_ITEMS = 10;

export type ProposalDigestItem = {
    id: string;
    title: string;
    requesterCount: number;
    impactedModules: string[];
    createdAt: Date;
};

export function buildProposalsMessage(items: ProposalDigestItem[], olderPending: number): string {
    const lines = ["\uD83D\uDCA1 *Usulan fitur baru (" + items.length + ")*", ""];
    items.forEach((p, i) => {
        const mods = p.impactedModules.length > 0 ? " [" + p.impactedModules.join(", ") + "]" : "";
        lines.push((i + 1) + ". " + p.title + mods);
        lines.push("   \uD83D\uDC65 " + p.requesterCount + " peminta");
    });
    if (olderPending > 0) {
        lines.push("");
        lines.push("_" + olderPending + " usulan lebih lama masih menunggu review._");
    }
    lines.push("");
    lines.push("Review: /admin/proposals");
    return lines.join("\n");
}

export type ProposalsDigestResult = {
    sent: boolean;
    reason: string;
    count?: number;
};

export async function runProposalsDigest(): Promise<ProposalsDigestResult> {
    const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
    if (!chatId) return { sent: false, reason: "TELEGRAM_OWNER_CHAT_ID not set" };

    const mainDb = getMainPrisma();
    const since = new Date(Date.now() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000);
    const fresh = await mainDb.featureProposal.findMany({
        where: { status: "PENDING_REVIEW", createdAt: { gte: since } },
        orderBy: [{ requesterCount: "desc" }, { createdAt: "desc" }],
        take: MAX_ITEMS,
    });
    if (fresh.length === 0) return { sent: false, reason: "no new proposals" };

    const olderPending = await mainDb.featureProposal.count({
        where: { status: "PENDING_REVIEW", createdAt: { lt: since } },
    });
    const text = buildProposalsMessage(fresh, olderPending);
    const res = await sendTelegramMessage(chatId, text);
    if (!res.ok) return { sent: false, reason: res.error };
    return { sent: true, reason: "ok", count: fresh.length };
}
