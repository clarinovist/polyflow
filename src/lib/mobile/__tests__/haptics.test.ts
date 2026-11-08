import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_SUCCESS_MS, hapticSuccess } from '../haptics';

describe('hapticSuccess', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('vibrates for a short fixed duration when supported', () => {
        const vibrate = vi.fn();
        vi.stubGlobal('navigator', { vibrate });

        hapticSuccess();

        expect(vibrate).toHaveBeenCalledWith(HAPTIC_SUCCESS_MS);
    });

    it('does nothing when vibrate is unsupported', () => {
        vi.stubGlobal('navigator', {});

        expect(() => hapticSuccess()).not.toThrow();
    });

    it('swallows errors thrown by vibrate', () => {
        vi.stubGlobal('navigator', {
            vibrate: () => {
                throw new Error('blocked');
            },
        });

        expect(() => hapticSuccess()).not.toThrow();
    });
});
