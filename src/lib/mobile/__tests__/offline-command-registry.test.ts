import { describe, it, expect, beforeEach } from 'vitest';
import {
    registerCommand,
    getCommandDef,
    isCommandRegistered,
    getRegisteredCommandTypes,
} from '../offline-command-registry';

describe('offline-command-registry', () => {
    beforeEach(() => {
        // Clean up by re-registering only built-in commands
        // The registry is a module-level Map, so we test with fresh registrations
    });

    it('registers and retrieves a command', () => {
        registerCommand({
            type: 'test.cmd',
            label: 'Test Command',
            validate: () => true,
            execute: async () => ({ ok: true }),
            requiresOnline: true,
        });

        expect(isCommandRegistered('test.cmd')).toBe(true);
        const def = getCommandDef('test.cmd');
        expect(def).toBeDefined();
        expect(def!.type).toBe('test.cmd');
        expect(def!.label).toBe('Test Command');
    });

    it('returns undefined for unregistered command', () => {
        expect(isCommandRegistered('unknown.cmd')).toBe(false);
        expect(getCommandDef('unknown.cmd')).toBeUndefined();
    });

    it('validates payload before queueing', () => {
        registerCommand({
            type: 'test.validate',
            label: 'Validate Test',
            validate: (payload: { name?: string }) => !!payload.name,
            execute: async () => ({}),
            requiresOnline: false,
        });

        const def = getCommandDef('test.validate');
        expect(def!.validate({ name: 'test' })).toBe(true);
        expect(def!.validate({})).toBe(false);
    });

    it('getRegisteredCommandTypes returns all registered types', () => {
        registerCommand({
            type: 'test.list',
            label: 'List Test',
            validate: () => true,
            execute: async () => ({}),
            requiresOnline: false,
        });

        const types = getRegisteredCommandTypes();
        expect(types).toContain('test.list');
    });
});
