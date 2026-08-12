import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
};

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: { employee: { findUnique: vi.fn() } },
}));

import { prisma } from '@/lib/core/prisma';
import {
    createEmployeeSessionToken,
    requireEmployeeSession,
} from '../employee-session';

async function setupSessionCookie() {
    const token = await createEmployeeSessionToken({
        employeeId: 'emp-1',
        code: 'EMP-001',
        name: 'Budi',
    });
    mockCookieStore.get.mockReturnValue({ value: token });
}

describe('requireEmployeeSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null and clears cookie when employee status is not ACTIVE', async () => {
        await setupSessionCookie();
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({
            id: 'emp-1',
            status: 'INACTIVE',
            pinHash: 'hash',
        } as any);

        const result = await requireEmployeeSession();

        expect(result).toBeNull();
        expect(mockCookieStore.delete).toHaveBeenCalledWith('emp_session');
    });

    it('returns null and clears cookie when pinHash has been reset', async () => {
        await setupSessionCookie();
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({
            id: 'emp-1',
            status: 'ACTIVE',
            pinHash: null,
        } as any);

        const result = await requireEmployeeSession();

        expect(result).toBeNull();
        expect(mockCookieStore.delete).toHaveBeenCalledWith('emp_session');
    });

    it('returns null and clears cookie when employee record no longer exists', async () => {
        await setupSessionCookie();
        vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);

        const result = await requireEmployeeSession();

        expect(result).toBeNull();
        expect(mockCookieStore.delete).toHaveBeenCalledWith('emp_session');
    });

    it('returns null without hitting the DB when no session cookie is present', async () => {
        mockCookieStore.get.mockReturnValue(undefined);

        const result = await requireEmployeeSession();

        expect(result).toBeNull();
        expect(prisma.employee.findUnique).not.toHaveBeenCalled();
    });

    it('returns the session payload when status ACTIVE and pinHash present', async () => {
        await setupSessionCookie();
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({
            id: 'emp-1',
            status: 'ACTIVE',
            pinHash: 'hash',
        } as any);

        const result = await requireEmployeeSession();

        expect(result).toEqual({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
            tenantId: undefined,
        });
        expect(mockCookieStore.delete).not.toHaveBeenCalled();
    });
});
