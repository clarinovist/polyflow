import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { headers } from 'next/headers';
import { rateLimit } from '@/lib/api/rate-limit';
import {
    KIOSK_RATE_LIMIT,
    KIOSK_RATE_WINDOW_MS,
    checkKioskRateLimit,
} from '../kiosk-guard';

function mockHeaders(values: Record<string, string>) {
    vi.mocked(headers).mockResolvedValue({
        get: (name: string) => values[name] ?? null,
    } as never);
}

describe('checkKioskRateLimit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHeaders({ 'x-forwarded-for': '10.1.1.1, 10.2.2.2' });
        vi.mocked(rateLimit).mockReturnValue({ success: true } as never);
    });

    it('uses the shared key kiosk:<ip>:<employeeCode> with the kiosk limits', async () => {
        await checkKioskRateLimit('EMP-001');

        expect(rateLimit).toHaveBeenCalledWith(
            'kiosk:10.1.1.1:EMP-001',
            KIOSK_RATE_LIMIT,
            KIOSK_RATE_WINDOW_MS,
        );
        expect(KIOSK_RATE_LIMIT).toBe(5);
        expect(KIOSK_RATE_WINDOW_MS).toBe(5 * 60 * 1000);
    });

    it('returns true while under the limit and false once exceeded', async () => {
        expect(await checkKioskRateLimit('EMP-001')).toBe(true);

        vi.mocked(rateLimit).mockReturnValue({ success: false } as never);
        expect(await checkKioskRateLimit('EMP-001')).toBe(false);
    });

    it('falls back to x-real-ip then 127.0.0.1', async () => {
        mockHeaders({ 'x-real-ip': '10.9.9.9' });
        await checkKioskRateLimit('EMP-001');
        expect(vi.mocked(rateLimit).mock.calls[0][0]).toBe(
            'kiosk:10.9.9.9:EMP-001',
        );

        mockHeaders({});
        await checkKioskRateLimit('EMP-001');
        expect(vi.mocked(rateLimit).mock.calls[1][0]).toBe(
            'kiosk:127.0.0.1:EMP-001',
        );
    });
});
