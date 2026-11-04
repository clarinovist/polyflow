import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ToolEvidence } from '../assistant-types';
import {
    ASSISTANT_PROTOCOL_VERSION,
    assistantAuthoritySchema,
} from './protocol';

export const ASSISTANT_BROKER_PROTOCOL_VERSION = ASSISTANT_PROTOCOL_VERSION;

export const assistantBrokerExecutionKeySchema = z
    .string()
    .min(1)
    .max(300)
    .regex(/^[A-Za-z0-9:._-]+$/);

export const assistantBrokerToolRequestSchema = z
    .object({
        protocolVersion: z.literal(ASSISTANT_BROKER_PROTOCOL_VERSION),
        authority: assistantAuthoritySchema,
        executionKey: assistantBrokerExecutionKeySchema,
        taskId: z.string().min(1).max(100),
        callId: z.string().min(1).max(100),
        toolName: z.string().regex(/^[a-z][a-z0-9_]{1,99}$/),
        arguments: z.record(z.string(), z.unknown()),
    })
    .strict();
export type AssistantBrokerToolRequest = z.infer<
    typeof assistantBrokerToolRequestSchema
>;

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(
                ([key, item]) =>
                    `${JSON.stringify(key)}:${canonicalJson(item)}`,
            )
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

export function assistantBrokerRequestDigest(
    request: AssistantBrokerToolRequest,
): string {
    return createHash('sha256')
        .update(
            canonicalJson({
                executionKey: request.executionKey,
                taskId: request.taskId,
                callId: request.callId,
                toolName: request.toolName,
                arguments: request.arguments,
            }),
        )
        .digest('hex');
}

const toolEvidenceSchema = z
    .object({
        summary: z.string().max(8_000),
        facts: z
            .array(
                z
                    .object({
                        label: z.string().max(500),
                        value: z.string().max(8_000),
                    })
                    .strict(),
            )
            .max(500),
        entities: z
            .array(
                z
                    .object({
                        type: z.string().max(100),
                        id: z.string().max(500),
                        label: z.string().max(500),
                        href: z.string().startsWith('/').max(1_000).optional(),
                    })
                    .strict(),
            )
            .max(500)
            .optional(),
        source: z.enum(['tenant-data', 'global-kb', 'tenant-kb', 'audit-log']),
        checkedAt: z.string().datetime(),
        completeness: z.enum(['complete', 'partial']),
        confidenceCap: z
            .union([
                z.literal(0.6),
                z.literal(0.75),
                z.literal(0.85),
                z.literal(0.9),
            ])
            .optional(),
        searchMeta: z
            .object({
                searchTerm: z.string().max(120).nullable(),
                candidates: z.array(z.string().max(120)).max(3),
                matchCount: z.number().int().nonnegative().nullable(),
                matchCountScope: z.enum(['returned', 'total', 'unknown']),
            })
            .strict()
            .optional(),
    })
    .strict();

export const assistantBrokerToolResponseSchema = z
    .object({
        protocolVersion: z.literal(ASSISTANT_BROKER_PROTOCOL_VERSION),
        executionKey: assistantBrokerExecutionKeySchema,
        toolName: z.string().regex(/^[a-z][a-z0-9_]{1,99}$/),
        evidence: toolEvidenceSchema,
    })
    .strict();
export type AssistantBrokerToolResponse = Omit<
    z.infer<typeof assistantBrokerToolResponseSchema>,
    'evidence'
> & { evidence: ToolEvidence };
