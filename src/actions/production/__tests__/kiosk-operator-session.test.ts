import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findEmployee: vi.fn(),
    verifyPin: vi.fn(),
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
    getSession: vi.fn(),
    rateLimit: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: <T>(fn: T) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { employee: { findFirst: mocks.findEmployee } },
    getTenantIdFromContext: () => 'tenant-a',
}));
vi.mock('next/headers', () => ({
    headers: async () => new Headers({ 'x-forwarded-for': '10.0.0.7, 10.0.0.1' }),
}));
vi.mock('@/services/hrd/pin-helpers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/hrd/pin-helpers')>()),
    verifyPin: mocks.verifyPin,
}));
vi.mock('@/lib/api/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('@/lib/auth/kiosk-operator-session', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/auth/kiosk-operator-session')>()),
    setKioskOperatorCookie: mocks.setCookie,
    clearKioskOperatorCookie: mocks.clearCookie,
    getKioskOperatorSession: mocks.getSession,
}));

import {
    endKioskOperatorSession,
    getKioskOperatorSessionInfo,
    startKioskOperatorSession,
} from '../kiosk-operator-session';
import { verifyKioskOperatorToken } from '@/lib/auth/kiosk-operator-session';

const employee = { id: 'emp-1', code: 'OP-01', name: 'Operator 1', pinHash: 'hash' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTH_SECRET', 'test-secret');
    mocks.rateLimit.mockReturnValue({ success: true });
    mocks.findEmployee.mockResolvedValue(employee);
    mocks.verifyPin.mockResolvedValue(true);
});

describe('startKioskOperatorSession', () => {
    it('sets a tenant-bound session cookie for an active operator with the right PIN', async () => {
        const result = await startKioskOperatorSession('emp-1', '1234');

        expect(result).toEqual({ success: true, data: { id: 'emp-1', name: 'Operator 1', code: 'OP-01' } });
        expect(mocks.findEmployee).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'emp-1', status: 'ACTIVE', role: 'OPERATOR' },
        }));
        expect(mocks.verifyPin).toHaveBeenCalledWith('1234', 'hash');
        const token = mocks.setCookie.mock.calls[0][0] as string;
        expect(verifyKioskOperatorToken(token, 'tenant-a')).toMatchObject({ employeeId: 'emp-1', code: 'OP-01' });
    });

    it('rate-limits PIN attempts per device address and operator', async () => {
        mocks.rateLimit.mockReturnValue({ success: false });

        const result = await startKioskOperatorSession('emp-1', '1234');

        expect(mocks.rateLimit).toHaveBeenCalledWith('kiosk_pin:10.0.0.7:emp-1', 5, 5 * 60 * 1000);
        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/Terlalu banyak percobaan/) });
        expect(mocks.findEmployee).not.toHaveBeenCalled();
    });

    it.each(['12', '12ab', '1234567'])('rejects malformed PIN %s before any lookup', async (pin) => {
        const result = await startKioskOperatorSession('emp-1', pin);

        expect(result.success).toBe(false);
        expect(mocks.findEmployee).not.toHaveBeenCalled();
    });

    it('rejects a wrong PIN without setting a cookie', async () => {
        mocks.verifyPin.mockResolvedValue(false);

        const result = await startKioskOperatorSession('emp-1', '9999');

        expect(result).toMatchObject({ success: false, error: 'PIN salah.' });
        expect(mocks.setCookie).not.toHaveBeenCalled();
    });

    it('points operators without a PIN to HR', async () => {
        mocks.findEmployee.mockResolvedValue({ ...employee, pinHash: null });

        const result = await startKioskOperatorSession('emp-1', '1234');

        expect(result).toMatchObject({ success: false, error: expect.stringMatching(/HRD/) });
        expect(mocks.verifyPin).not.toHaveBeenCalled();
    });

    it('rejects unknown or inactive operators', async () => {
        mocks.findEmployee.mockResolvedValue(null);

        const result = await startKioskOperatorSession('emp-x', '1234');

        expect(result.success).toBe(false);
        expect(mocks.setCookie).not.toHaveBeenCalled();
    });
});

describe('end and read the kiosk operator session', () => {
    it('clears the cookie when the operator leaves', async () => {
        await expect(endKioskOperatorSession()).resolves.toEqual({ success: true, data: null });
        expect(mocks.clearCookie).toHaveBeenCalled();
    });

    it('returns the verified operator or null', async () => {
        mocks.getSession.mockResolvedValueOnce({ employeeId: 'emp-1', code: 'OP-01', name: 'Operator 1', tenantId: 'tenant-a' });
        await expect(getKioskOperatorSessionInfo()).resolves.toEqual({
            success: true,
            data: { id: 'emp-1', name: 'Operator 1', code: 'OP-01' },
        });

        mocks.getSession.mockResolvedValueOnce(null);
        await expect(getKioskOperatorSessionInfo()).resolves.toEqual({ success: true, data: null });
    });
});
