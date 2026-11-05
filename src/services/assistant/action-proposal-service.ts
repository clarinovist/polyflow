import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { ValidationError } from '@/lib/errors/errors';
import { CollectionService } from '../sales/collection-service';

/**
 * Assistant write proposals: propose -> human confirm.
 *
 * The model-side process may only create a PENDING proposal. A person confirms
 * it in the app, and execution goes through the normal service layer inside the
 * same transaction that claims the proposal, so a failed write rolls the claim
 * back and a double confirm can execute at most once.
 */

export const PROPOSAL_TTL_MS = 15 * 60 * 1000;
export const COLLECTION_FOLLOWUP_KIND = 'COLLECTION_FOLLOWUP';
const MAX_NOTES_LENGTH = 2000;
const MAX_OUTCOME_LENGTH = 200;

export type ProposalStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'EXPIRED';

export type AssertInvoiceAccess = (invoiceId: string) => Promise<void>;

const collectionFollowupSchema = z.object({
    invoiceId: z.string().min(1),
    type: z.enum([
        'CALL',
        'VISIT',
        'PROMISE_TO_PAY',
        'PARTIAL_COLLECTED',
        'DISPUTE',
        'UNREACHABLE',
    ]),
    activityDate: z.string().datetime().optional(),
    promisedDate: z.string().datetime().optional(),
    promisedAmount: z.number().nonnegative().optional(),
    outcome: z.string().max(MAX_OUTCOME_LENGTH).optional(),
    notes: z.string().max(MAX_NOTES_LENGTH).optional(),
});

export type CollectionFollowupPayload = z.infer<
    typeof collectionFollowupSchema
>;

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries
            .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

export function computeProposalDigest(
    tenantId: string,
    userId: string,
    kind: string,
    payload: unknown,
): string {
    return createHash('sha256')
        .update(canonicalJson({ tenantId, userId, kind, payload }))
        .digest('hex');
}

function parseCollectionFollowup(raw: unknown): CollectionFollowupPayload {
    const parsed = collectionFollowupSchema.safeParse(raw);
    if (!parsed.success) {
        throw new ValidationError(
            `Proposal follow-up tidak valid: ${parsed.error.issues
                .map((i) => i.path.join('.') || i.message)
                .join(', ')}`,
        );
    }
    const data = parsed.data;
    if (data.type === 'PROMISE_TO_PAY') {
        if (!data.promisedDate) {
            throw new ValidationError(
                'promisedDate wajib diisi untuk PROMISE_TO_PAY',
            );
        }
        if (data.promisedAmount == null) {
            throw new ValidationError(
                'promisedAmount wajib diisi untuk PROMISE_TO_PAY',
            );
        }
    }
    return data;
}

export async function createCollectionFollowupProposal(input: {
    tenantId: string;
    userId: string;
    conversationId: string;
    payload: unknown;
    assertInvoiceAccess: AssertInvoiceAccess;
    now?: Date;
}) {
    const payload = parseCollectionFollowup(input.payload);
    await input.assertInvoiceAccess(payload.invoiceId);

    const now = input.now ?? new Date();
    const payloadDigest = computeProposalDigest(
        input.tenantId,
        input.userId,
        COLLECTION_FOLLOWUP_KIND,
        payload,
    );

    // update:{} keeps propose idempotent and never resets a decided proposal.
    return prisma.assistantActionProposal.upsert({
        where: {
            conversationId_payloadDigest: {
                conversationId: input.conversationId,
                payloadDigest,
            },
        },
        create: {
            tenantId: input.tenantId,
            userId: input.userId,
            conversationId: input.conversationId,
            kind: COLLECTION_FOLLOWUP_KIND,
            payload,
            payloadDigest,
            status: 'PENDING',
            expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS),
        },
        update: {},
    });
}

export async function confirmProposal(input: {
    proposalId: string;
    tenantId: string;
    userId: string;
    assertInvoiceAccess: AssertInvoiceAccess;
    now?: Date;
}): Promise<{ proposalId: string; resultRef: string }> {
    const now = input.now ?? new Date();

    return prisma.$transaction(async (tx) => {
        // Atomic claim: only the owner's unexpired PENDING proposal can win.
        const claim = await tx.assistantActionProposal.updateMany({
            where: {
                id: input.proposalId,
                tenantId: input.tenantId,
                userId: input.userId,
                status: 'PENDING',
                expiresAt: { gt: now },
            },
            data: { status: 'CONFIRMED', confirmedAt: now },
        });

        if (claim.count !== 1) {
            const current = await prisma.assistantActionProposal.findFirst({
                where: {
                    id: input.proposalId,
                    tenantId: input.tenantId,
                    userId: input.userId,
                },
                select: { status: true },
            });
            throw new ValidationError(
                `PROPOSAL_NOT_CONFIRMABLE:${current?.status ?? 'NOT_FOUND'}`,
            );
        }

        const proposal = await tx.assistantActionProposal.findFirst({
            where: { id: input.proposalId },
        });
        if (!proposal || proposal.kind !== COLLECTION_FOLLOWUP_KIND) {
            throw new ValidationError('PROPOSAL_KIND_UNSUPPORTED');
        }

        const payload = parseCollectionFollowup(proposal.payload);
        await input.assertInvoiceAccess(payload.invoiceId);

        const record = await CollectionService.logCollectionActivity(
            {
                invoiceId: payload.invoiceId,
                userId: input.userId,
                type: payload.type,
                activityDate: payload.activityDate
                    ? new Date(payload.activityDate)
                    : undefined,
                promisedDate: payload.promisedDate
                    ? new Date(payload.promisedDate)
                    : undefined,
                promisedAmount: payload.promisedAmount,
                outcome: payload.outcome,
                notes: payload.notes,
            },
            tx,
        );

        await logActivity({
            userId: input.userId,
            action: 'ASSISTANT_PROPOSAL_CONFIRMED',
            entityType: 'CollectionActivity',
            entityId: record.id,
            details: `Asisten: follow-up penagihan dikonfirmasi (proposal ${input.proposalId})`,
            tx,
        });

        await tx.assistantActionProposal.update({
            where: { id: input.proposalId },
            data: { resultRef: record.id },
        });

        return { proposalId: input.proposalId, resultRef: record.id };
    });
}

export async function cancelProposal(input: {
    proposalId: string;
    tenantId: string;
    userId: string;
}) {
    const res = await prisma.assistantActionProposal.updateMany({
        where: {
            id: input.proposalId,
            tenantId: input.tenantId,
            userId: input.userId,
            status: 'PENDING',
        },
        data: { status: 'CANCELLED' },
    });
    return res.count === 1;
}

const ACTIVITY_LABEL: Record<CollectionFollowupPayload['type'], string> = {
    CALL: 'telepon penagihan',
    VISIT: 'kunjungan penagihan',
    PROMISE_TO_PAY: 'janji bayar',
    PARTIAL_COLLECTED: 'penagihan sebagian',
    DISPUTE: 'sengketa tagihan',
    UNREACHABLE: 'pelanggan tidak terjangkau',
};
const MAX_PENDING_LISTED = 10;

export type PendingProposalView = {
    id: string;
    kind: string;
    summary: string;
    details: { label: string; value: string }[];
    expiresAt: string;
};

function formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
    });
}

/** Display-safe view of the caller's own live proposals (no raw payload). */
export async function listPendingProposals(input: {
    tenantId: string;
    userId: string;
    now?: Date;
}): Promise<PendingProposalView[]> {
    const now = input.now ?? new Date();
    const rows = await prisma.assistantActionProposal.findMany({
        where: {
            tenantId: input.tenantId,
            userId: input.userId,
            status: 'PENDING',
            expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_PENDING_LISTED,
    });
    if (rows.length === 0) return [];

    const parsed = rows.flatMap((row) => {
        if (row.kind !== COLLECTION_FOLLOWUP_KIND) return [];
        const result = collectionFollowupSchema.safeParse(row.payload);
        return result.success ? [{ row, payload: result.data }] : [];
    });
    if (parsed.length === 0) return [];

    const invoices = await prisma.invoice.findMany({
        where: { id: { in: parsed.map((p) => p.payload.invoiceId) } },
        select: { id: true, invoiceNumber: true },
    });
    const numbers = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));

    return parsed.map(({ row, payload }) => {
        const number = numbers.get(payload.invoiceId) ?? payload.invoiceId;
        const details: PendingProposalView['details'] = [];
        if (payload.promisedDate) {
            details.push({
                label: 'Janji bayar',
                value: formatDay(payload.promisedDate),
            });
        }
        if (payload.promisedAmount != null) {
            details.push({
                label: 'Nominal janji',
                value: `Rp ${payload.promisedAmount.toLocaleString('id-ID')}`,
            });
        }
        if (payload.outcome) {
            details.push({ label: 'Hasil', value: payload.outcome });
        }
        if (payload.notes) {
            details.push({ label: 'Catatan', value: payload.notes });
        }
        return {
            id: row.id,
            kind: row.kind,
            summary: `Catat ${ACTIVITY_LABEL[payload.type]} pada invoice ${number}`,
            details,
            expiresAt: row.expiresAt.toISOString(),
        };
    });
}
