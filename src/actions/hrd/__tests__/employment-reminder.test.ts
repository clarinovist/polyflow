import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    requireHrdFinance: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    dispatchReminders: vi.fn(),
    logActivity: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/auth/hrd-access', () => ({
    requireHrdFinance: mocks.requireHrdFinance,
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.logActivity }));
vi.mock('@/lib/hrd/employment-reminder', () => ({
    HR_ALERT_TYPES: ['HRD_PROBATION_ENDING', 'HRD_CONTRACT_EXPIRING'],
    dispatchReminders: mocks.dispatchReminders,
}));
vi.mock('@/services/core/notification-service', () => ({
    NotificationService: {
        markAsRead: mocks.markAsRead,
        markAllAsRead: mocks.markAllAsRead,
    },
}));

import {
    markHrAlertRead,
    markHrAlertsAllRead,
    scanEmploymentReminders,
} from '../employment-reminder';

function session(role: string) {
    return { user: { id: 'user-1', role, roles: [{ role }] } };
}

describe('HR alert actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireHrdFinance.mockResolvedValue(session('HRD'));
        mocks.requireAuth.mockResolvedValue(session('HRD'));
        mocks.markAsRead.mockResolvedValue({ count: 1 });
        mocks.markAllAsRead.mockResolvedValue({ count: 3 });
        mocks.dispatchReminders.mockResolvedValue({ scanned: 1, created: 2 });
    });

    it('marks one alert read only for the session user', async () => {
        const res = await markHrAlertRead('n-1');
        expect(res.success).toBe(true);
        expect(mocks.markAsRead).toHaveBeenCalledWith('n-1', 'user-1');
    });

    it('reports failure when the alert is not owned by the user', async () => {
        mocks.markAsRead.mockResolvedValue({ count: 0 });
        const res = await markHrAlertRead('n-other');
        expect(res.success).toBe(false);
        if (!res.success) expect(res.error).toMatch(/peringatan/i);
    });

    it('rejects an empty alert id without touching the service', async () => {
        const res = await markHrAlertRead('');
        expect(res.success).toBe(false);
        expect(mocks.markAsRead).not.toHaveBeenCalled();
    });

    it('marks all HR alerts read only for the session user', async () => {
        const res = await markHrAlertsAllRead();
        expect(res.success).toBe(true);
        expect(mocks.markAllAsRead).toHaveBeenCalledWith('user-1', [
            'HRD_PROBATION_ENDING',
            'HRD_CONTRACT_EXPIRING',
        ]);
    });

    it('rejects mark-read for roles without HRD access', async () => {
        mocks.requireHrdFinance.mockRejectedValue(
            new Error('Unauthorized'),
        );
        const res = await markHrAlertsAllRead();
        expect(res.success).toBe(false);
        expect(mocks.markAllAsRead).not.toHaveBeenCalled();
    });

    it('allows the scan for HRD and logs it', async () => {
        const res = await scanEmploymentReminders();
        expect(res.success).toBe(true);
        expect(mocks.dispatchReminders).toHaveBeenCalledTimes(1);
        expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    });

    it('rejects the scan for FINANCE with an Indonesian message', async () => {
        mocks.requireAuth.mockResolvedValue(session('FINANCE'));
        const res = await scanEmploymentReminders();
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error).toContain('admin atau HRD');
            expect(res.error).not.toMatch(/approve|finalize|void/i);
        }
        expect(mocks.dispatchReminders).not.toHaveBeenCalled();
    });
});
