import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendTelegramMessageMock = vi.fn();
vi.mock('@/lib/telegram/send-message', () => ({
    sendTelegramMessage: (...args: unknown[]) =>
        sendTelegramMessageMock(...args),
}));

const { alertCrossTenantContextLeak } = await import(
    '../tenant-context-leak-alert'
);

const globalForThrottle = globalThis as unknown as {
    __polyflowLastTenantLeakAlertAt?: number;
};

const details = {
    subdomain: 'acme',
    leakedFromTenantId: 'tenant-a',
    resolvedTenantId: 'tenant-b',
};

describe('alertCrossTenantContextLeak', () => {
    beforeEach(() => {
        sendTelegramMessageMock.mockReset();
        sendTelegramMessageMock.mockResolvedValue({ ok: true, messageId: 1 });
        delete globalForThrottle.__polyflowLastTenantLeakAlertAt;
        vi.stubEnv('TELEGRAM_SYSTEM_ALERT_CHAT_ID', '123456');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('no-ops when TELEGRAM_SYSTEM_ALERT_CHAT_ID is not set', () => {
        vi.stubEnv('TELEGRAM_SYSTEM_ALERT_CHAT_ID', '');

        alertCrossTenantContextLeak(details);

        expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    });

    it('sends an alert to the configured chat id when triggered', () => {
        alertCrossTenantContextLeak(details);

        expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
        const [chatId, message] = sendTelegramMessageMock.mock.calls[0];
        expect(chatId).toBe('123456');
        expect(message).toContain('acme');
        expect(message).toContain('tenant-a');
        expect(message).toContain('tenant-b');
    });

    it('throttles repeated alerts within the same window', () => {
        alertCrossTenantContextLeak(details);
        alertCrossTenantContextLeak(details);
        alertCrossTenantContextLeak(details);

        expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
    });

    it('allows a new alert once the throttle window has passed', () => {
        vi.useFakeTimers();
        try {
            alertCrossTenantContextLeak(details);
            expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(60_001);
            alertCrossTenantContextLeak(details);

            expect(sendTelegramMessageMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('never throws even if sendTelegramMessage rejects', () => {
        sendTelegramMessageMock.mockRejectedValue(new Error('network down'));

        expect(() => alertCrossTenantContextLeak(details)).not.toThrow();
    });
});
