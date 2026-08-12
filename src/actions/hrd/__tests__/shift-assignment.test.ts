import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    listShiftAssignments,
    createShiftAssignment,
    endShiftAssignment,
} from '../shift-assignment';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { EmployeeShiftAssignmentService } from '@/services/hrd/employee-shift-assignment-service';
import { logActivity } from '@/lib/tools/audit';
import { BusinessRuleError } from '@/lib/errors/errors';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

vi.mock('@/lib/auth/hrd-access', () => ({
    requireHrdApprover: vi.fn(),
    requireHrdFinance: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/services/hrd/employee-shift-assignment-service', () => ({
    EmployeeShiftAssignmentService: {
        listByEmployee: vi.fn(),
        create: vi.fn(),
        endAssignment: vi.fn(),
    },
}));

const assignment = {
    id: 'assign-1',
    employeeId: 'emp-1',
    employeeName: 'Akhmad Agung Cahyadi',
    employeeCode: 'EMP-150',
    workShiftId: 'shift-1',
    shiftName: 'Kantor',
    effectiveFrom: new Date('2026-08-12'),
    effectiveTo: null,
    createdAt: new Date('2026-08-12'),
};

describe('shift-assignment actions — HRD gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('listShiftAssignments', () => {
        it('returns a failure response when requireHrdFinance rejects', async () => {
            vi.mocked(requireHrdFinance).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await listShiftAssignments('emp-1');

            expect(res.success).toBe(false);
            expect(
                EmployeeShiftAssignmentService.listByEmployee,
            ).not.toHaveBeenCalled();
        });

        it('lists assignments when requireHrdFinance resolves', async () => {
            vi.mocked(requireHrdFinance).mockResolvedValue({
                user: { id: 'hrd-1', role: 'HRD' },
            } as any);
            vi.mocked(
                EmployeeShiftAssignmentService.listByEmployee,
            ).mockResolvedValue([assignment]);

            const res = await listShiftAssignments('emp-1');

            expect(res.success).toBe(true);
            expect(
                EmployeeShiftAssignmentService.listByEmployee,
            ).toHaveBeenCalledWith({}, 'emp-1');
        });
    });

    describe('createShiftAssignment', () => {
        it('returns a failure response when requireHrdApprover rejects', async () => {
            vi.mocked(requireHrdApprover).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await createShiftAssignment({
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-08-12'),
            });

            expect(res.success).toBe(false);
            expect(EmployeeShiftAssignmentService.create).not.toHaveBeenCalled();
            expect(logActivity).not.toHaveBeenCalled();
        });

        it('creates assignment and logs activity when authorized', async () => {
            vi.mocked(requireHrdApprover).mockResolvedValue({
                user: { id: 'hrd-1', role: 'HRD' },
            } as any);
            vi.mocked(EmployeeShiftAssignmentService.create).mockResolvedValue(
                assignment,
            );

            const res = await createShiftAssignment({
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-08-12'),
            });

            expect(res.success).toBe(true);
            expect(EmployeeShiftAssignmentService.create).toHaveBeenCalled();
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'SHIFT_ASSIGNMENT_CREATED',
                    entityType: 'EmployeeShiftAssignment',
                    entityId: assignment.id,
                }),
            );
        });

        it('propagates a business rule error from the service (e.g. overlap)', async () => {
            vi.mocked(requireHrdApprover).mockResolvedValue({
                user: { id: 'hrd-1', role: 'HRD' },
            } as any);
            vi.mocked(EmployeeShiftAssignmentService.create).mockRejectedValue(
                new BusinessRuleError(
                    'Karyawan sudah memiliki assignment shift yang overlap pada periode ini',
                ),
            );

            const res = await createShiftAssignment({
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-08-12'),
            });

            expect(res.success).toBe(false);
            expect(logActivity).not.toHaveBeenCalled();
        });
    });

    describe('endShiftAssignment', () => {
        it('returns a failure response when requireHrdApprover rejects', async () => {
            vi.mocked(requireHrdApprover).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await endShiftAssignment(
                'assign-1',
                new Date('2026-08-31'),
            );

            expect(res.success).toBe(false);
            expect(
                EmployeeShiftAssignmentService.endAssignment,
            ).not.toHaveBeenCalled();
        });

        it('ends assignment and logs activity when authorized', async () => {
            vi.mocked(requireHrdApprover).mockResolvedValue({
                user: { id: 'hrd-1', role: 'HRD' },
            } as any);
            vi.mocked(
                EmployeeShiftAssignmentService.endAssignment,
            ).mockResolvedValue({
                ...assignment,
                effectiveTo: new Date('2026-08-31'),
            });

            const res = await endShiftAssignment(
                'assign-1',
                new Date('2026-08-31'),
            );

            expect(res.success).toBe(true);
            expect(
                EmployeeShiftAssignmentService.endAssignment,
            ).toHaveBeenCalledWith({}, 'assign-1', new Date('2026-08-31'));
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'SHIFT_ASSIGNMENT_ENDED',
                }),
            );
        });
    });
});
