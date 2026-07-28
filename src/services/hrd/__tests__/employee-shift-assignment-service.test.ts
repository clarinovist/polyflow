import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmployeeShiftAssignmentService } from '../employee-shift-assignment-service';

const mockDb = {
    employee: { findUnique: vi.fn() },
    workShift: { findUnique: vi.fn() },
    employeeShiftAssignment: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
    attendanceRecord: { count: vi.fn() },
};

describe('EmployeeShiftAssignmentService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const activeEmployee = {
        id: 'emp-1',
        name: 'Budi',
        code: 'EMP-001',
        status: 'ACTIVE',
    };
    const activeShift = {
        id: 'shift-1',
        name: 'Pagi',
        status: 'ACTIVE',
    };

    describe('create', () => {
        it('creates assignment successfully', async () => {
            vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
            vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
            vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue(null);
            vi.mocked(mockDb.employeeShiftAssignment.create).mockResolvedValue({
                id: 'assign-1',
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-01-01'),
                effectiveTo: null,
                createdAt: new Date(),
                employee: { name: 'Budi', code: 'EMP-001' },
                workShift: { name: 'Pagi' },
            } as any);

            const result = await EmployeeShiftAssignmentService.create(mockDb as any, {
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-01-01'),
            });

            expect(result.employeeName).toBe('Budi');
            expect(result.shiftName).toBe('Pagi');
            expect(result.effectiveTo).toBeNull();
        });

        it('throws when employee not found', async () => {
            vi.mocked(mockDb.employee.findUnique).mockResolvedValue(null);

            await expect(
                EmployeeShiftAssignmentService.create(mockDb as any, {
                    employeeId: 'emp-missing',
                    workShiftId: 'shift-1',
                    effectiveFrom: new Date('2026-01-01'),
                }),
            ).rejects.toThrow('Karyawan tidak ditemukan');
        });

        it('throws when shift is inactive', async () => {
            vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
            vi.mocked(mockDb.workShift.findUnique).mockResolvedValue({
                ...activeShift,
                status: 'INACTIVE',
            } as any);

            await expect(
                EmployeeShiftAssignmentService.create(mockDb as any, {
                    employeeId: 'emp-1',
                    workShiftId: 'shift-1',
                    effectiveFrom: new Date('2026-01-01'),
                }),
            ).rejects.toThrow('Shift tidak aktif');
        });

        it('throws when effectiveTo is before effectiveFrom', async () => {
            vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
            vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);

            await expect(
                EmployeeShiftAssignmentService.create(mockDb as any, {
                    employeeId: 'emp-1',
                    workShiftId: 'shift-1',
                    effectiveFrom: new Date('2026-06-01'),
                    effectiveTo: new Date('2026-01-01'),
                }),
            ).rejects.toThrow('Tanggal akhir harus setelah');
        });

        it('throws when overlapping assignment exists', async () => {
            vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
            vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
            vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue({
                id: 'existing-assign',
            } as any);

            await expect(
                EmployeeShiftAssignmentService.create(mockDb as any, {
                    employeeId: 'emp-1',
                    workShiftId: 'shift-1',
                    effectiveFrom: new Date('2026-01-01'),
                }),
            ).rejects.toThrow('overlap');
        });
    });

    describe('endAssignment', () => {
        it('ends assignment successfully', async () => {
            vi.mocked(mockDb.employeeShiftAssignment.findUnique).mockResolvedValue({
                id: 'assign-1',
                effectiveFrom: new Date('2026-01-01'),
                employee: { name: 'Budi', code: 'EMP-001' },
                workShift: { name: 'Pagi' },
            } as any);
            vi.mocked(mockDb.employeeShiftAssignment.update).mockResolvedValue({
                id: 'assign-1',
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-01-01'),
                effectiveTo: new Date('2026-06-30'),
                createdAt: new Date(),
                employee: { name: 'Budi', code: 'EMP-001' },
                workShift: { name: 'Pagi' },
            } as any);

            const result = await EmployeeShiftAssignmentService.endAssignment(
                mockDb as any,
                'assign-1',
                new Date('2026-06-30'),
            );

            expect(result.effectiveTo).toEqual(new Date('2026-06-30'));
        });

        it('throws when assignment not found', async () => {
            vi.mocked(mockDb.employeeShiftAssignment.findUnique).mockResolvedValue(null);

            await expect(
                EmployeeShiftAssignmentService.endAssignment(
                    mockDb as any,
                    'missing',
                    new Date('2026-06-30'),
                ),
            ).rejects.toThrow('Assignment tidak ditemukan');
        });
    });

    describe('remove', () => {
        it('removes assignment when no attendance records exist', async () => {
            vi.mocked(mockDb.employeeShiftAssignment.findUnique).mockResolvedValue({
                id: 'assign-1',
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-01-01'),
            } as any);
            vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);

            await EmployeeShiftAssignmentService.remove(mockDb as any, 'assign-1');

            expect(mockDb.employeeShiftAssignment.delete).toHaveBeenCalledWith({
                where: { id: 'assign-1' },
            });
        });

        it('throws when attendance records exist', async () => {
            vi.mocked(mockDb.employeeShiftAssignment.findUnique).mockResolvedValue({
                id: 'assign-1',
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-01-01'),
            } as any);
            vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(5);

            await expect(
                EmployeeShiftAssignmentService.remove(mockDb as any, 'assign-1'),
            ).rejects.toThrow('sudah memiliki catatan absensi');
        });
    });

    describe('getActiveForDate', () => {
        it('returns assignment active on given date', async () => {
            vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue({
                id: 'assign-1',
                employeeId: 'emp-1',
                workShiftId: 'shift-1',
                effectiveFrom: new Date('2026-01-01'),
                effectiveTo: null,
                createdAt: new Date(),
                employee: { name: 'Budi', code: 'EMP-001' },
                workShift: { name: 'Pagi' },
            } as any);

            const result = await EmployeeShiftAssignmentService.getActiveForDate(
                mockDb as any,
                'emp-1',
                new Date('2026-07-15'),
            );

            expect(result).not.toBeNull();
            expect(result!.shiftName).toBe('Pagi');
        });

        it('returns null when no active assignment', async () => {
            vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue(null);

            const result = await EmployeeShiftAssignmentService.getActiveForDate(
                mockDb as any,
                'emp-1',
                new Date('2026-07-15'),
            );

            expect(result).toBeNull();
        });
    });
});
