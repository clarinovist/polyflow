import { afterEach, describe, expect, it, vi } from 'vitest';
import { isKillSwitchActive, getPilotSubdomain } from '../kill-switch';

afterEach(() => vi.unstubAllEnvs());

describe('shared Telegram controls after Mini App retirement', () => {
    it('does not disable alerts just because the Mini App is gone', () => {
        vi.stubEnv('TELEGRAM_KILL_SWITCH', undefined);
        vi.stubEnv('TELEGRAM_MINI_APP_ENABLED', 'false');
        expect(isKillSwitchActive()).toBe(false);
    });

    it.each(['true', '1', 'on', 'ON'])('honors global emergency switch %s', (value) => {
        vi.stubEnv('TELEGRAM_KILL_SWITCH', value);
        expect(isKillSwitchActive()).toBe(true);
    });

    it.each(['false', '0', 'off', ''])('keeps alerts enabled for %s', (value) => {
        vi.stubEnv('TELEGRAM_KILL_SWITCH', value);
        expect(isKillSwitchActive()).toBe(false);
    });

    it('preserves configurable pilot resolution for the shared digest', () => {
        vi.stubEnv('TELEGRAM_PILOT_TENANT_SUBDOMAIN', 'test-pilot');
        expect(getPilotSubdomain()).toBe('test-pilot');
        vi.stubEnv('TELEGRAM_PILOT_TENANT_SUBDOMAIN', undefined);
        expect(getPilotSubdomain()).toBeTruthy();
    });
});
