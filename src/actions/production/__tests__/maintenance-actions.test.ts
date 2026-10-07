import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    approveMaintenanceRequest,
    getMaintenanceDetail,
    getMaintenanceRequests,
    startMaintenanceRequest,
    submitMaintenanceRequest,
} from '../maintenance';
import { prisma } from '@/lib/core/prisma';
import { MaintenanceService } from '@/services/production/maintenance-service';
import { requireAuth } from '@/lib/tools/auth-checks';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: never[]) => unknown) => fn,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (data: unknown) => data }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/services/core/notification-service', () => ({
    NotificationService: {
        createNotification: vi.fn(),
        createBulkNotifications: vi.fn(),
    },
}));
vi.mock('@/services/production/maintenance-service', () => ({
    MaintenanceService: {
        create: vi.fn(),
        submit: vi.fn(),
        approve: vi.fn(),
        reject: vi.fn(),
        start: vi.fn(),
        complete: vi.fn(),
        getById: vi.fn(),
    },
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findMany: vi.fn(), findFirst: vi.fn() },
        userRole: { findMany: vi.fn() },
        maintenanceRequest: {
            findMany: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
        },
    },
}));

const baseDetail = {
    id: 'mt-1',
    orderNumber: 'MT-1',
    status: 'PENDING',
    createdById: 'reporter-1',
    assigneeId: null,
    assigneeName: null,
    spareParts: [],
    machine: { id: 'machine-1', code: 'MC-01', name: 'Mesin Satu' },
    createdBy: { id: 'reporter-1', name: 'Pelapor' },
    approvedBy: null,
    assignee: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
        user: { id: 'manager-1', role: 'FACTORY_MANAGER', roles: ['FACTORY_MANAGER'] },
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.maintenanceRequest.findMany).mockResolvedValue([]);
    vi.mocked(prisma.maintenanceRequest.count).mockResolvedValue(0);
    vi.mocked(prisma.maintenanceRequest.groupBy).mockResolvedValue([]);
    vi.mocked(MaintenanceService.getById).mockResolvedValue(baseDetail as never);
});

describe('maintenance actions', () => {
    it('builds paginated triage results and hides drafts from other users', async () => {
        vi.mocked(prisma.maintenanceRequest.findMany).mockResolvedValue([
            {
                id: 'mt-1',
                orderNumber: 'MT-1',
                complaint: 'Suara kasar',
                urgency: 'URGENT',
                status: 'PENDING',
                assigneeName: null,
                machineStopped: true,
                createdAt: new Date('2026-10-07T00:00:00Z'),
                updatedAt: new Date('2026-10-07T00:00:00Z'),
                machine: { code: 'MC-01', name: 'Mesin Satu' },
                _count: { spareParts: 2 },
            },
        ] as never);
        vi.mocked(prisma.maintenanceRequest.count)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1);
        vi.mocked(prisma.maintenanceRequest.groupBy).mockResolvedValue([
            { status: 'PENDING', _count: { _all: 1 } },
        ] as never);

        const result = await getMaintenanceRequests({
            queue: 'ACTION',
            q: 'MC-01',
            page: 2,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.rows[0].sparePartCount).toBe(2);
        expect(result.data.stats.pending).toBe(1);
        expect(prisma.maintenanceRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 20, take: 20 }),
        );
        const args = vi.mocked(prisma.maintenanceRequest.findMany).mock.calls[0][0];
        expect(JSON.stringify(args?.where)).toContain('createdById');
        expect(JSON.stringify(args?.where)).toContain('PENDING');
        expect(JSON.stringify(args?.where)).toContain('MC-01');
    });

    it("keeps another production user from opening someone else's draft", async () => {
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'other-1', role: 'PRODUCTION', roles: ['PRODUCTION'] },
        } as never);
        vi.mocked(MaintenanceService.getById).mockResolvedValue({
            ...baseDetail,
            status: 'DRAFT',
        } as never);

        const result = await getMaintenanceDetail('mt-1');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('MAINTENANCE_DRAFT_OWNER_REQUIRED');
    });

    it('returns role-aware capabilities and the active technician roster', async () => {
        vi.mocked(prisma.user.findMany).mockResolvedValue([
            { id: 'tech-1', name: 'Teknisi Satu', email: 'tech@example.test' },
        ] as never);

        const result = await getMaintenanceDetail('mt-1');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.viewer).toMatchObject({
            canApprove: true,
            canReject: true,
            canStart: false,
        });
        expect(result.data.technicians).toEqual([
            { id: 'tech-1', name: 'Teknisi Satu' },
        ]);
    });

    it('prevents a non-admin reporter from deciding their own maintenance', async () => {
        vi.mocked(requireAuth).mockResolvedValue({
            user: {
                id: 'reporter-1',
                role: 'FACTORY_MANAGER',
                roles: ['FACTORY_MANAGER'],
            },
        } as never);

        const result = await approveMaintenanceRequest('mt-1', 'tech-1');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
        expect(MaintenanceService.approve).not.toHaveBeenCalled();
    });

    it('validates and persists a real production assignee on approval', async () => {
        vi.mocked(prisma.user.findFirst).mockResolvedValue({
            id: 'tech-1',
            name: 'Teknisi Satu',
            email: 'tech@example.test',
        } as never);
        vi.mocked(MaintenanceService.approve).mockResolvedValue({
            id: 'mt-1',
            orderNumber: 'MT-1',
            createdById: 'reporter-1',
        } as never);

        const result = await approveMaintenanceRequest('mt-1', 'tech-1');

        expect(result.success).toBe(true);
        expect(MaintenanceService.approve).toHaveBeenCalledWith(
            'mt-1',
            'manager-1',
            'tech-1',
        );
    });

    it('does not let an approver execute work assigned to another user', async () => {
        vi.mocked(MaintenanceService.getById).mockResolvedValue({
            ...baseDetail,
            status: 'APPROVED',
            assigneeId: 'tech-1',
        } as never);

        const result = await getMaintenanceDetail('mt-1');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.viewer.canStart).toBe(false);
        expect(result.data.viewer.canComplete).toBe(false);
    });

    it('allows the assigned technician to start but rejects an unrelated user', async () => {
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'tech-1', role: 'PRODUCTION', roles: ['PRODUCTION'] },
        } as never);
        vi.mocked(MaintenanceService.getById).mockResolvedValue({
            ...baseDetail,
            status: 'APPROVED',
            assigneeId: 'tech-1',
        } as never);
        vi.mocked(MaintenanceService.start).mockResolvedValue({ id: 'mt-1' } as never);

        const allowed = await startMaintenanceRequest('mt-1');
        expect(allowed.success).toBe(true);

        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'other-1', role: 'PRODUCTION', roles: ['PRODUCTION'] },
        } as never);
        const denied = await startMaintenanceRequest('mt-1');
        expect(denied.success).toBe(false);
        expect(MaintenanceService.start).toHaveBeenCalledTimes(1);
    });

    it('submits only a draft owned by the signed-in reporter', async () => {
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'reporter-1', role: 'PRODUCTION', roles: ['PRODUCTION'] },
        } as never);
        vi.mocked(MaintenanceService.submit).mockResolvedValue({ id: 'mt-1' } as never);

        const result = await submitMaintenanceRequest('mt-1');

        expect(result.success).toBe(true);
        expect(MaintenanceService.submit).toHaveBeenCalledWith('mt-1', 'reporter-1');
    });
});
