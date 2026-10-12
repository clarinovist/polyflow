import { createHash } from 'node:crypto';
import type {
    AssistantDurableBinding,
    AssistantDurableSubmission,
    Prisma,
    PrismaClient,
} from '@prisma/client';
import { tenantStorageKey } from './authority';
import {
    ASSISTANT_PROTOCOL_VERSION,
    AssistantWorkerProtocolError,
    type AssistantAuthority,
    type AssistantSubmissionEnvelope,
} from './protocol';

export type DurableAdmission = {
    binding: AssistantDurableBinding;
    reservation: AssistantDurableSubmission;
};

/** Serialize only the short create/bind admission windows. Model and tool work
 * must never run while a lock is held. */
export class DurableAdmissionLocks {
    private readonly tails = new Map<string, Promise<void>>();

    async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tail = previous.catch(() => undefined).then(() => gate);
        this.tails.set(key, tail);
        await previous.catch(() => undefined);
        try {
            return await operation();
        } finally {
            release();
            if (this.tails.get(key) === tail) this.tails.delete(key);
        }
    }

    get size(): number {
        return this.tails.size;
    }
}

export function requestAdmissionLockKey(
    input: Pick<
        AssistantSubmissionEnvelope,
        'tenantId' | 'userId' | 'channel' | 'requestId'
    >,
): string {
    return opaqueLockKey(
        'request',
        input.tenantId,
        input.userId,
        input.channel,
        input.requestId,
    );
}

export function conversationAdmissionLockKey(
    publicConversationId: string,
): string {
    return opaqueLockKey('conversation', publicConversationId);
}

/** Atomically create/assert the parent binding before creating/reusing the
 * child reservation. No model, tool, tenant query, or SQLite work belongs in
 * this transaction. */
export async function reserveDurableAdmission(input: {
    database: Pick<PrismaClient, '$transaction'>;
    envelope: AssistantSubmissionEnvelope;
    authority: AssistantAuthority;
    questionHash: string;
    durableConversationId: string;
}): Promise<DurableAdmission> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await input.database.$transaction((transaction) =>
                reserveInTransaction(transaction, input),
            );
        } catch (error) {
            if (attempt === 0 && isUniqueConflict(error)) continue;
            throw error;
        }
    }
    throw new Error('ASSISTANT_ADMISSION_RETRY_EXHAUSTED');
}

async function reserveInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
        envelope: AssistantSubmissionEnvelope;
        authority: AssistantAuthority;
        questionHash: string;
        durableConversationId: string;
    },
): Promise<DurableAdmission> {
    const existingBinding =
        await transaction.assistantDurableBinding.findUnique({
            where: {
                publicConversationId: input.authority.publicConversationId,
            },
        });
    const binding = existingBinding
        ? assertDurableBinding(existingBinding, input)
        : await transaction.assistantDurableBinding.create({
              data: expectedBinding(input),
          });

    const requestKey = {
        tenantId: input.envelope.tenantId,
        userId: input.envelope.userId,
        channel: input.envelope.channel,
        requestId: input.envelope.requestId,
    };
    const existingReservation =
        await transaction.assistantDurableSubmission.findUnique({
            where: { tenantId_userId_channel_requestId: requestKey },
        });
    if (existingReservation) {
        assertReservation(existingReservation, input);
        const reservation = await transaction.assistantDurableSubmission.update(
            {
                where: { id: existingReservation.id },
                data: { attempts: { increment: 1 } },
            },
        );
        return { binding, reservation };
    }

    const reservation = await transaction.assistantDurableSubmission.create({
        data: {
            requestId: input.envelope.requestId,
            questionHash: input.questionHash,
            publicConversationId: input.authority.publicConversationId,
            tenantId: input.envelope.tenantId,
            userId: input.envelope.userId,
            channel: input.envelope.channel,
            status: 'pending',
            attempts: 1,
        },
    });
    return { binding, reservation };
}

function expectedBinding(input: {
    authority: AssistantAuthority;
    durableConversationId: string;
}): Prisma.AssistantDurableBindingUncheckedCreateInput {
    return {
        publicConversationId: input.authority.publicConversationId,
        tenantId: input.authority.tenantId,
        userId: input.authority.userId,
        channel: input.authority.channel,
        accessScopeHash: input.authority.accessScopeHash,
        workContextKey: input.authority.workContextKey,
        storageKey: tenantStorageKey(input.authority.tenantId),
        durableConversationId: input.durableConversationId,
        storageVersion: ASSISTANT_PROTOCOL_VERSION,
        pathname: input.authority.pathname,
        profile: input.authority.profile,
    };
}

export function assertDurableBinding(
    binding: AssistantDurableBinding,
    input: {
        authority: AssistantAuthority;
        durableConversationId: string;
    },
): AssistantDurableBinding {
    const expected = expectedBinding(input);
    if (
        binding.tenantId !== expected.tenantId ||
        binding.userId !== expected.userId ||
        binding.channel !== expected.channel ||
        binding.accessScopeHash !== expected.accessScopeHash ||
        binding.workContextKey !== expected.workContextKey ||
        binding.storageKey !== expected.storageKey ||
        binding.durableConversationId !== expected.durableConversationId ||
        binding.storageVersion !== expected.storageVersion ||
        binding.pathname !== expected.pathname ||
        binding.profile !== expected.profile
    ) {
        throw new AssistantWorkerProtocolError(
            'CONTEXT_MISMATCH',
            'Conversation binding does not match the active access context.',
            409,
        );
    }
    return binding;
}

function assertReservation(
    reservation: AssistantDurableSubmission,
    input: {
        envelope: AssistantSubmissionEnvelope;
        authority: AssistantAuthority;
        questionHash: string;
    },
): void {
    if (
        reservation.questionHash !== input.questionHash ||
        reservation.publicConversationId !==
            input.authority.publicConversationId ||
        reservation.tenantId !== input.envelope.tenantId ||
        reservation.userId !== input.envelope.userId ||
        reservation.channel !== input.envelope.channel
    ) {
        throw new AssistantWorkerProtocolError(
            'CONTEXT_MISMATCH',
            'requestId is already bound to a different submission.',
            409,
        );
    }
}

function isUniqueConflict(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
    );
}

function opaqueLockKey(...parts: string[]): string {
    return createHash('sha256').update(parts.join('\0')).digest('hex');
}
