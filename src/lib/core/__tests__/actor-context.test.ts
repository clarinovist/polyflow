import { describe, expect, it } from 'vitest';
import { getActorUserId, runWithActor } from '../actor-context';

describe('actorContext', () => {
    it('returns undefined outside runWithActor scope', () => {
        expect(getActorUserId()).toBeUndefined();
    });

    it('returns userId inside runWithActor scope', () => {
        runWithActor('user-123', () => {
            expect(getActorUserId()).toBe('user-123');
        });
    });

    it('returns undefined again after runWithActor completes', () => {
        runWithActor('user-123', () => {});
        expect(getActorUserId()).toBeUndefined();
    });

    it('supports nested scopes (inner overrides outer)', () => {
        runWithActor('outer', () => {
            expect(getActorUserId()).toBe('outer');
            runWithActor('inner', () => {
                expect(getActorUserId()).toBe('inner');
            });
            expect(getActorUserId()).toBe('outer');
        });
    });

    it('propagates return value from callback', () => {
        const result = runWithActor('user-1', () => 42);
        expect(result).toBe(42);
    });
});
