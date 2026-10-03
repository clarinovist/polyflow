import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { z } from 'zod';
import { toolRegistry } from '../../tool-registry';
import { createPolyflowReadOnlyTools, zodToTypeBox } from '../tool-adapter';

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
