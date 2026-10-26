import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    cookieGet: vi.fn(),
    cookieSet: vi.fn(),
    cookieDelete: vi.fn(),
    cookiesFails: false,
    findEmployee: vi.fn(),
    tenantId: 'tenant-a' as string | undefined,
}));

vi.mock('next/headers', () => ({
    cookies: async () => {
        if (mocks.cookiesFails) throw new Error('cookies() outside a request');
        return { get: mocks.cookieGet, set: mocks.cookieSet, delete: mocks.cookieDelete };
    },
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { employee: { findUnique: mocks.findEmployee } },
    getTenantIdFromContext: () => mocks.tenantId,
}));

import {
    KIOSK_OPERATOR_COOKIE,
    clearKioskOperatorCookie,
    createKioskOperatorToken,
    getKioskOperatorSession,
    setKioskOperatorCookie,
    verifyKioskOperatorToken,
} from '../kiosk-operator-session';

const operator = { employeeId: 'emp-1', code: 'OP-01', name: 'Operator 1', tenantId: 'tenant-a' };
const NOW = 1_800_000_000;
const TWELVE_HOURS = 12 * 60 * 60;

beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'test-secret');
    vi.stubEnv('NODE_ENV', 'test');
    mocks.cookiesFails = false;
    mocks.tenantId = 'tenant-a';
    mocks.cookieGet.mockReset();
    mocks.cookieSet.mockReset();
    mocks.cookieDelete.mockReset();
    mocks.findEmployee.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('kiosk operator token', () => {
    it('round-trips a signed operator for the same tenant', () => {
        const token = createKioskOperatorToken(operator, NOW);

        expect(verifyKioskOperatorToken(token, 'tenant-a', NOW + 60)).toEqual(operator);
    });

    it('rejects a tampered payload or signature', () => {
        const [body, sig] = createKioskOperatorToken(operator, NOW).split('.');
        const forged = Buffer.from(JSON.stringify({ ...operator, employeeId: 'emp-2', exp: NOW + 999 })).toString('base64url');

        expect(verifyKioskOperatorToken(`${forged}.${sig}`, 'tenant-a', NOW)).toBeNull();
        expect(verifyKioskOperatorToken(`${body}.${sig.slice(0, -2)}xx`, 'tenant-a', NOW)).toBeNull();
        expect(verifyKioskOperatorToken(`${body}.${sig}.extra`, 'tenant-a', NOW)).toBeNull();
        expect(verifyKioskOperatorToken('', 'tenant-a', NOW)).toBeNull();
        expect(verifyKioskOperatorToken(undefined, 'tenant-a', NOW)).toBeNull();
    });

    it('expires after one long shift', () => {
        const token = createKioskOperatorToken(operator, NOW);

        expect(verifyKioskOperatorToken(token, 'tenant-a', NOW + TWELVE_HOURS)).toEqual(operator);
        expect(verifyKioskOperatorToken(token, 'tenant-a', NOW + TWELVE_HOURS + 1)).toBeNull();
    });

    it('refuses a token minted for another tenant', () => {
        const token = createKioskOperatorToken(operator, NOW);

        expect(verifyKioskOperatorToken(token, 'tenant-b', NOW)).toBeNull();
    });

    it('does not accept a token signed with a different secret', () => {
        const token = createKioskOperatorToken(operator, NOW);
        vi.stubEnv('AUTH_SECRET', 'another-secret');

        expect(verifyKioskOperatorToken(token, 'tenant-a', NOW)).toBeNull();
    });

    it('fails closed in production when no secret is configured', () => {
        vi.stubEnv('AUTH_SECRET', '');
        vi.stubEnv('EMPLOYEE_JWT_SECRET', '');
        vi.stubEnv('NODE_ENV', 'production');

        expect(() => createKioskOperatorToken(operator, NOW)).toThrow();
    });

    it('rejects a payload with a malformed body', () => {
        const token = createKioskOperatorToken(operator, NOW);
        const sig = token.split('.')[1];

        expect(verifyKioskOperatorToken(`not-json.${sig}`, 'tenant-a', NOW)).toBeNull();
    });
});

describe('kiosk operator cookie', () => {
    it('stores the token httpOnly on the kiosk path and clears it on the same path', async () => {
        await setKioskOperatorCookie('token-1');
        await clearKioskOperatorCookie();

        expect(mocks.cookieSet).toHaveBeenCalledWith(
            KIOSK_OPERATOR_COOKIE,
            'token-1',
            expect.objectContaining({ httpOnly: true, path: '/kiosk', sameSite: 'lax', maxAge: TWELVE_HOURS }),
        );
        expect(mocks.cookieDelete).toHaveBeenCalledWith({ name: KIOSK_OPERATOR_COOKIE, path: '/kiosk' });
    });
});

describe('getKioskOperatorSession', () => {
    it('returns the operator while the employee is active and still has a PIN', async () => {
        mocks.cookieGet.mockReturnValue({ value: createKioskOperatorToken(operator) });
        mocks.findEmployee.mockResolvedValue({ status: 'ACTIVE', pinHash: 'hash' });

        await expect(getKioskOperatorSession()).resolves.toEqual(operator);
        expect(mocks.findEmployee).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'emp-1' } }));
    });

    it.each([
        ['inactive', { status: 'INACTIVE', pinHash: 'hash' }],
        ['PIN removed', { status: 'ACTIVE', pinHash: null }],
        ['deleted', null],
    ])('drops the session when the employee is %s', async (_label, employee) => {
        mocks.cookieGet.mockReturnValue({ value: createKioskOperatorToken(operator) });
        mocks.findEmployee.mockResolvedValue(employee);

        await expect(getKioskOperatorSession()).resolves.toBeNull();
    });

    it('returns null without a cookie or outside a request', async () => {
        mocks.cookieGet.mockReturnValue(undefined);
        await expect(getKioskOperatorSession()).resolves.toBeNull();

        mocks.cookiesFails = true;
        await expect(getKioskOperatorSession()).resolves.toBeNull();
        expect(mocks.findEmployee).not.toHaveBeenCalled();
    });
});
