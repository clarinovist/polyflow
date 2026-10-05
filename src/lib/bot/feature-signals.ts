/**
 * Feature request signals — unmet needs from assistant conversations.
 * Mirrors the help-learning pattern: cluster -> proposal draft -> super-admin review.
 * Read-only w.r.t. business data; proposals are documents, never auto-builds.
 */
import { suggestModule } from './help-clustering';

// Explicit feature-request cues, Indonesian + English.
const REQUEST_PATTERNS = [
    /tambah(kan|in)?\s+(fitur|menu|halaman|laporan|kolom|tombol|opsi)/i,
    /minta\s+(dibuat|dibuatkan|ditambah|fitur)/i,
    /mohon\s+(dibuat|ditambah)/i,
    /tolong\s+(buatkan|buatin|tambah(kan|in)?)/i,
    /kapan\s+bisa/i,
    /pengen\s+ada/i,
    /(harusnya|seharusnya|sebaiknya)\s+ada/i,
    /usul(an)?\s+fitur/i,
    /saran\s+fitur/i,
    /fitur\s+baru/i,
    /feature\s+request/i,
    /please\s+add/i,
    /can\s+you\s+add/i,
    /i\s+wish/i,
    /would\s+be\s+(great|nice)/i,
    /add\s+(a|the)\s+\w+\s+(feature|button|page|report|column)/i,
];

// Minimum distinct users before a cluster becomes a proposal candidate.
export const FEATURE_CANDIDATE_MIN_USERS = 3;

const MAX_SAMPLE_IDS = 20;
const MAX_SAMPLE_REQUESTS = 5;

export function isFeatureRequest(question: string): boolean {
    if (!question || question.trim().length < 8) return false;
    return REQUEST_PATTERNS.some((re) => re.test(question));
}

export function normalizeRequest(question: string): string {
    return question
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\b(tolong|mohon|minta|tambah|tambahkan|tambahin|dibuat|dibuatkan|buatkan|buatin|bisa|bisakah|kapan|pengen|please|add|feature|fitur|baru|yang|untuk|agar|supaya|dong|ya|kah)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .sort()
        .join('_')
        .slice(0, 120);
}

export function canonicalizeRequest(question: string): string {
    return question.trim().slice(0, 200);
}

export type FeatureSignalInput = {
    question: string;
    redactedSample: string;
    userId?: string;
    tenantId?: string;
    signalKind?: string;
};

function cappedPush(list: string[], value: string | undefined, cap: number): string[] {
    if (!value) return list;
    const next = list.includes(value) ? list : [value, ...list];
    return next.slice(0, cap);
}

export async function upsertFeatureSignal(input: FeatureSignalInput) {
    const { getMainPrisma } = await import('@/lib/core/prisma');
    const mainDb = getMainPrisma();

    const normalizedKey = normalizeRequest(input.question);
    if (!normalizedKey) return null;

    const canonical = canonicalizeRequest(input.question);
    const suggestedMod = suggestModule(input.question);
    const kind = input.signalKind || "explicit_request";

    try {
        const existing = await mainDb.featureSignalCluster.findUnique({
            where: { normalizedKey },
        });

        if (existing) {
            const sampleUserIds = cappedPush(existing.sampleUserIds || [], input.userId, MAX_SAMPLE_IDS);
            const tenantIds = cappedPush(existing.tenantIds || [], input.tenantId, MAX_SAMPLE_IDS);
            const uniqueUsers = sampleUserIds.length || existing.uniqueUsers;
            const samples = existing.sampleRequests || [];
            const newSamples = samples.includes(input.redactedSample)
                ? samples
                : [input.redactedSample, ...samples].slice(0, MAX_SAMPLE_REQUESTS);

            const updated = await mainDb.featureSignalCluster.update({
                where: { id: existing.id },
                data: {
                    hitCount: { increment: 1 },
                    uniqueUsers,
                    sampleUserIds,
                    tenantIds,
                    sampleRequests: newSamples,
                    lastSeenAt: new Date(),
                    canonicalRequest: canonical,
                },
            });
            await maybePropose(mainDb, updated);
            return updated;
        }

        const created = await mainDb.featureSignalCluster.create({
            data: {
                canonicalRequest: canonical,
                normalizedKey,
                signalKind: kind,
                hitCount: 1,
                uniqueUsers: input.userId ? 1 : 0,
                sampleUserIds: input.userId ? [input.userId] : [],
                tenantIds: input.tenantId ? [input.tenantId] : [],
                suggestedModule: suggestedMod,
                sampleRequests: [input.redactedSample],
                status: "OPEN",
            },
        });
        await maybePropose(mainDb, created);
        return created;
    } catch {
        return null;
    }
}

type ProposalStore = Pick<import("@prisma/client").PrismaClient, "featureProposal" | "featureSignalCluster">;

type SignalClusterRow = {
    id: string;
    uniqueUsers: number;
    canonicalRequest: string;
    tenantIds: string[];
    suggestedModule: string | null;
    sampleRequests: string[];
    status: string;
};

async function maybePropose(mainDb: ProposalStore, cluster: SignalClusterRow) {
    try {
        if (!cluster || cluster.uniqueUsers < FEATURE_CANDIDATE_MIN_USERS) return null;
        if (cluster.status !== "OPEN" && cluster.status !== "CANDIDATE") return null;
        const { generateProposalDraft, buildTemplateDraft } = await import("./feature-draft");
        const draftInput = {
            canonicalRequest: cluster.canonicalRequest,
            sampleRequests: cluster.sampleRequests || [],
            uniqueUsers: cluster.uniqueUsers,
            tenantIds: cluster.tenantIds || [],
            suggestedModule: cluster.suggestedModule || null,
        };
        const draft = (await generateProposalDraft(draftInput)) || buildTemplateDraft(draftInput);
        const proposal = await mainDb.featureProposal.create({
            data: {
                clusterId: cluster.id,
                title: draft.title,
                problemMd: draft.problemMd,
                evidenceMd: "Sampel permintaan (" + (cluster.sampleRequests || []).length + "):\n- " + (cluster.sampleRequests || []).join("\n- "),
                impactedModules: draft.impactedModules,
                requesterCount: cluster.uniqueUsers,
                status: "PENDING_REVIEW",
            },
        });
        await mainDb.featureSignalCluster.update({
            where: { id: cluster.id },
            data: { status: "PROPOSED" },
        });
        return proposal;
    } catch {
        return null;
    }
}
