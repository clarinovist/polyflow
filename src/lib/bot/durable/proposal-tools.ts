import { z } from 'zod';
import {
    BusinessRuleError,
    ValidationError,
    NotFoundError,
} from '@/lib/errors/errors';
import {
    createCollectionFollowupProposal,
    COLLECTION_FOLLOWUP_KIND,
    PROPOSAL_TTL_MS,
} from '@/services/assistant/action-proposal-service';
import { buildInvoiceAccessGuard } from '@/services/assistant/invoice-access';
import type { AssistantUserContext, ToolEvidence } from '../assistant-types';
import type { AssistantAuthority } from './protocol';
import { PROPOSE_COLLECTION_FOLLOWUP_TOOL } from './proposal-tool-names';

/**
 * Proposal tools are the assistant's only write-shaped tools, and they never
 * write business data: they record a PENDING proposal that a person must
 * confirm in the app. They are deliberately kept out of `toolRegistry` so the
 * legacy chat path and the local (non-broker) durable path can never expose
 * them. They execute only inside the broker, where authority is revalidated.
 */
export type AssistantProposalToolDefinition = {
    name: string;
    description: string;
    requiredResources: string[];
    sensitivity: 'normal';
    inputSchema: z.ZodSchema;
    execute: (
        args: unknown,
        input: { context: AssistantUserContext; authority: AssistantAuthority },
    ) => Promise<ToolEvidence>;
};

export { PROPOSE_COLLECTION_FOLLOWUP_TOOL };

const proposeCollectionFollowupSchema = z
    .object({
        invoiceId: z.string().min(1).max(100),
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
        outcome: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
    })
    .strict();

function evidence(
    summary: string,
    facts: ToolEvidence['facts'],
    completeness: ToolEvidence['completeness'],
    entities?: ToolEvidence['entities'],
): ToolEvidence {
    return {
        summary,
        facts,
        entities,
        source: 'tenant-data',
        checkedAt: new Date().toISOString(),
        completeness,
    };
}

export const proposeCollectionFollowupTool: AssistantProposalToolDefinition = {
    name: PROPOSE_COLLECTION_FOLLOWUP_TOOL,
    description:
        'Usulkan pencatatan follow-up penagihan (telepon, kunjungan, janji bayar, sengketa) pada sebuah invoice. ' +
        'Ini HANYA membuat usulan yang menunggu konfirmasi pengguna di aplikasi; tidak ada data yang diubah sampai pengguna menyetujui. ' +
        'Jangan katakan catatan sudah tersimpan.',
    requiredResources: ['/sales/collection'],
    sensitivity: 'normal',
    inputSchema: proposeCollectionFollowupSchema,
    execute: async (args, { context, authority }) => {
        try {
            const proposal = await createCollectionFollowupProposal({
                tenantId: authority.tenantId,
                userId: authority.userId,
                conversationId: authority.publicConversationId,
                payload: args,
                assertInvoiceAccess: buildInvoiceAccessGuard({
                    userId: context.userId,
                    roles: context.roles,
                }),
            });
            const minutes = Math.round(PROPOSAL_TTL_MS / 60_000);
            return evidence(
                `Usulan follow-up penagihan dibuat dan MENUNGGU konfirmasi pengguna (berlaku ${minutes} menit). Belum ada data yang diubah.`,
                [
                    { label: 'Status', value: proposal.status },
                    { label: 'Jenis', value: COLLECTION_FOLLOWUP_KIND },
                    { label: 'ID usulan', value: proposal.id },
                ],
                'complete',
                [
                    {
                        type: 'AssistantActionProposal',
                        id: proposal.id,
                        label: 'Usulan follow-up penagihan',
                    },
                ],
            );
        } catch (error) {
            if (
                error instanceof ValidationError ||
                error instanceof NotFoundError ||
                error instanceof BusinessRuleError
            ) {
                return evidence(
                    `Usulan tidak dibuat: ${error.message}`,
                    [],
                    'partial',
                );
            }
            throw error;
        }
    },
};

export const proposalToolRegistry: readonly AssistantProposalToolDefinition[] =
    [proposeCollectionFollowupTool];

export function getProposalToolByName(
    name: string,
): AssistantProposalToolDefinition | undefined {
    return proposalToolRegistry.find((tool) => tool.name === name);
}
