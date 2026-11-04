import { describe, expect, it, vi } from 'vitest';
import { Value } from 'typebox/value';
import { z } from 'zod';
import { toolRegistry } from '../../tool-registry';
import {
    createPolyflowReadOnlyTools,
    executeAssistantToolCall,
    zodToTypeBox,
} from '../tool-adapter';

function requiredFrom(schema: ReturnType<typeof zodToTypeBox>) {
    return new Set(
        ((schema as unknown as { required?: string[] }).required ?? []).sort(),
    );
}

describe('Pi Durable tool adapter', () => {
    it('installs exactly the curated Polyflow registry and no coding tools', () => {
        const extension = createPolyflowReadOnlyTools();
        const names = extension.tools?.map((tool) => tool.name).sort();
        expect(names).toEqual(toolRegistry.map((tool) => tool.name).sort());
        expect(names).not.toEqual(expect.arrayContaining(['bash', 'read', 'write', 'edit']));
    });

    it('accepts an explicit broker routing set without installing extra tools', () => {
        const client = { execute: vi.fn() };
        const extension = createPolyflowReadOnlyTools({
            broker: {
                client,
                toolNames: new Set(['get_daily_production_output']),
            },
        });
        expect(extension.tools?.map((tool) => tool.name).sort()).toEqual(
            toolRegistry.map((tool) => tool.name).sort(),
        );
        expect(client.execute).not.toHaveBeenCalled();
    });

    it('routes the canary to broker and never falls back to local execution', async () => {
        const localExecute = vi.fn();
        const brokerExecute = vi.fn(async () => ({
            summary: 'broker evidence',
            facts: [],
            source: 'tenant-data' as const,
            checkedAt: '2026-11-04T00:00:00.000Z',
            completeness: 'complete' as const,
        }));
        const tool = {
            name: 'get_daily_production_output',
            description: 'Synthetic canary',
            requiredResources: ['/production/output-report'],
            sensitivity: 'normal' as const,
            inputSchema: z.object({ date: z.string() }).strict(),
            execute: localExecute,
        };
        const input = {
            freshTool: tool,
            args: { date: '2026-11-03' },
            authority: {
                schemaVersion: 1 as const,
                publicConversationId: 'conversation-one',
                tenantId: 'tenant-one',
                userId: 'user-one',
                channel: 'web' as const,
                accessScopeHash: 'a'.repeat(64),
                workContextKey: 'production:hash',
                pathname: '/production/output-report',
                profile: 'production' as const,
            },
            assistantContext: {
                userId: 'user-one',
                roles: ['PRODUCTION'],
                allowedResources: ['/production/output-report'],
                tenantId: 'tenant-one',
                channel: 'web' as const,
                locale: 'id',
            },
            executionKey: '1:2:call-one',
            taskId: '2',
            callId: 'call-one',
            broker: {
                client: { execute: brokerExecute },
                toolNames: new Set(['get_daily_production_output']),
            },
        };
        await expect(executeAssistantToolCall(input)).resolves.toMatchObject({
            summary: 'broker evidence',
        });
        expect(localExecute).not.toHaveBeenCalled();

        brokerExecute.mockRejectedValueOnce(new Error('broker unavailable'));
        await expect(executeAssistantToolCall(input)).rejects.toThrow(
            'broker unavailable',
        );
        expect(localExecute).not.toHaveBeenCalled();
    });

    it('preserves required fields and validates again with Zod', () => {
        for (const tool of toolRegistry) {
            const schema = zodToTypeBox(tool);
            const json = zodToTypeBox(tool) as unknown as {
                properties?: Record<string, unknown>;
            };
            const zodJson = z.toJSONSchema(tool.inputSchema) as {
                required?: string[];
                properties?: Record<string, unknown>;
            };
            expect(Object.keys(json.properties ?? {}).sort()).toEqual(
                Object.keys(zodJson.properties ?? {}).sort(),
            );
            expect(requiredFrom(schema)).toEqual(
                new Set((zodJson.required ?? []).sort()),
            );
            expect(Value.Check(schema, {})).toBe(
                tool.inputSchema.safeParse({}).success,
            );
        }
    });
});
