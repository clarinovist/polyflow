'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { EmployeeStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from '@/lib/tools/audit';
import {
    buildSalaryChanges,
    createSalaryHistory,
    SALARY_FIELDS,
} from '@/lib/hrd/salary-history';
import { hasHrdFinanceAccess } from '@/lib/auth/hrd-access';

// Strip salary/BPJS fields (and pinHash) for actors without HRD/Finance/Admin access.
function redactSalaryFields<T extends Record<string, unknown>>(employee: T): T {
    const redacted = Object.fromEntries(SALARY_FIELDS.map((f) => [f, null]));
    return { ...employee, ...redacted, pinHash: null };
}

// Fase 2: optional personal/HR master data block. All fields optional.
export interface EmployeePersonalData {
    employmentStatus?:
        | 'PROBATION'
        | 'PERMANENT'
        | 'CONTRACT'
        | 'RESIGNED'
        | 'TERMINATED';
    joinDate?: string;
    probationEndDate?: string;
    contractEndDate?: string;
    nik?: string;
    npwp?: string;
    birthDate?: string;
    birthPlace?: string;
    gender?: 'MALE' | 'FEMALE';
    maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
    address?: string;
    phone?: string;
    photoUrl?: string;
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
}

// Convert personal data block to prisma create/update payload. Drops undefined keys.
function toPersonalDb(d?: EmployeePersonalData) {
    if (!d) return {};
    const out: Record<string, unknown> = {};
    if (d.employmentStatus) out.employmentStatus = d.employmentStatus;
    if (d.joinDate) out.joinDate = new Date(d.joinDate);
    if (d.probationEndDate) out.probationEndDate = new Date(d.probationEndDate);
    if (d.contractEndDate) out.contractEndDate = new Date(d.contractEndDate);
    if (d.nik !== undefined) out.nik = d.nik || null;
    if (d.npwp !== undefined) out.npwp = d.npwp || null;
    if (d.birthDate) out.birthDate = new Date(d.birthDate);
    if (d.birthPlace !== undefined) out.birthPlace = d.birthPlace || null;
    if (d.gender !== undefined) out.gender = d.gender || null;
    if (d.maritalStatus !== undefined)
        out.maritalStatus = d.maritalStatus || null;
    if (d.address !== undefined) out.address = d.address || null;
    if (d.phone !== undefined) out.phone = d.phone || null;
    if (d.photoUrl !== undefined) out.photoUrl = d.photoUrl || null;
    if (d.bankName !== undefined) out.bankName = d.bankName || null;
    if (d.bankAccountNo !== undefined)
        out.bankAccountNo = d.bankAccountNo || null;
    if (d.bankAccountName !== undefined)
        out.bankAccountName = d.bankAccountName || null;
    if (d.emergencyContactName !== undefined)
        out.emergencyContactName = d.emergencyContactName || null;
    if (d.emergencyContactPhone !== undefined)
        out.emergencyContactPhone = d.emergencyContactPhone || null;
    if (d.emergencyContactRelation !== undefined)
        out.emergencyContactRelation = d.emergencyContactRelation || null;
    return out;
}

export const getEmployees = withTenant(async function getEmployees() {
    return safeAction(async () => {
        try {
            const employees = await prisma.employee.findMany({
                orderBy: { createdAt: 'desc' },
            });
            if (!(await hasHrdFinanceAccess())) {
                return employees.map((e) => redactSalaryFields(e));
            }
            return employees;
        } catch (error) {
            logger.error('Failed to get employees', {
                error,
                module: 'EmployeeActions',
            });
            throw new BusinessRuleError('Gagal mengambil direktori personil');
        }
    });
});

export const getEmployeeById = withTenant(async function getEmployeeById(
    id: string,
) {
    return safeAction(async () => {
        try {
            const employee = await prisma.employee.findUnique({
                where: { id },
            });
            if (!employee) {
                throw new BusinessRuleError('Karyawan tidak ditemukan');
            }
            const canViewSalary = await hasHrdFinanceAccess();
            return canViewSalary ? employee : redactSalaryFields(employee);
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to get employee', {
                error,
                employeeId: id,
                module: 'EmployeeActions',
            });
            throw new BusinessRuleError(
                'Terjadi kesalahan database saat mengambil karyawan',
            );
        }
    });
});

export const createEmployee = withTenant(async function createEmployee(data: {
    name: string;
    code: string;
    role: string;
    status?: EmployeeStatus;
    payType?: 'DAILY' | 'PIECE' | 'MONTHLY';
    dailyRate?: number;
    overtimeHourlyRate?: number;
    standardDayHours?: number;
    monthlySalary?: number;
    bpjsParticipant?: boolean;
    bpjsEmployeeDeduction?: number;
    bpjsEmployerCost?: number;
    bpjsKesehatanNo?: string;
    bpjsKetenagakerjaanNo?: string;
    personal?: EmployeePersonalData;
}) {
    return safeAction(async () => {
        try {
            const session = await requireAuth();
            const canEditSalary = await hasHrdFinanceAccess();
            // Actors without HRD/Finance/Admin access get schema defaults for
            // salary/BPJS fields — client-supplied values are ignored, not trusted.
            const salaryCreateFields = canEditSalary
                ? {
                      payType: data.payType || 'DAILY',
                      dailyRate: data.dailyRate || 0,
                      overtimeHourlyRate: data.overtimeHourlyRate
                          ? data.overtimeHourlyRate
                          : null,
                      standardDayHours: data.standardDayHours ?? 8,
                      ...(data.payType === 'MONTHLY'
                          ? {
                                monthlySalary: data.monthlySalary ?? null,
                            }
                          : {}),
                      bpjsParticipant: data.bpjsParticipant ?? false,
                      bpjsEmployeeDeduction: data.bpjsEmployeeDeduction ?? null,
                      bpjsEmployerCost: data.bpjsEmployerCost ?? null,
                  }
                : {
                      payType: 'DAILY' as const,
                      dailyRate: 0,
                      overtimeHourlyRate: null,
                      standardDayHours: 8,
                      bpjsParticipant: false,
                      bpjsEmployeeDeduction: null,
                      bpjsEmployerCost: null,
                  };
            const employee = await prisma.employee.create({
                data: {
                    name: data.name,
                    code: data.code,
                    role: data.role,
                    status: data.status || 'ACTIVE',
                    ...salaryCreateFields,
                    // BPJS ID numbers — not salary-critical, settable by anyone.
                    bpjsKesehatanNo: data.bpjsKesehatanNo ?? null,
                    bpjsKetenagakerjaanNo: data.bpjsKetenagakerjaanNo ?? null,
                    ...toPersonalDb(data.personal),
                },
            });
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_CREATED',
                entityType: 'Employee',
                entityId: employee.id,
                details: `Created employee ${employee.code} — ${employee.name} (role=${employee.role}, payType=${employee.payType}, dailyRate=${employee.dailyRate})`,
            });
            revalidatePath('/dashboard/employees');
            revalidatePath('/production/resources');
            return employee;
        } catch (error) {
            logger.error('Failed to create employee', {
                error,
                module: 'EmployeeActions',
            });
            throw new BusinessRuleError('Gagal onboard personil');
        }
    });
});

export const updateEmployee = withTenant(async function updateEmployee(
    id: string,
    data: {
        name?: string;
        code?: string;
        role?: string;
        status?: EmployeeStatus;
        payType?: 'DAILY' | 'PIECE' | 'MONTHLY';
        dailyRate?: number;
        overtimeHourlyRate?: number;
        standardDayHours?: number;
        monthlySalary?: number;
        bpjsParticipant?: boolean;
        bpjsEmployeeDeduction?: number;
        bpjsEmployerCost?: number;
        bpjsKesehatanNo?: string;
        bpjsKetenagakerjaanNo?: string;
        personal?: EmployeePersonalData;
    },
) {
    return safeAction(async () => {
        try {
            const session = await requireAuth();
            const canEditSalary = await hasHrdFinanceAccess();
            // Snapshot old values for salary-critical fields (compliance audit).
            const before = await prisma.employee.findUnique({
                where: { id },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    dailyRate: true,
                    overtimeHourlyRate: true,
                    standardDayHours: true,
                    payType: true,
                    status: true,
                    role: true,
                    monthlySalary: true,
                    bpjsParticipant: true,
                    bpjsEmployeeDeduction: true,
                    bpjsEmployerCost: true,
                },
            });
            if (!before) {
                throw new BusinessRuleError('Karyawan tidak ditemukan');
            }
            const { personal: _p1, ...coreData } = data;
            // Salary/BPJS-amount fields are handled separately below (gated by
            // canEditSalary) so they must not leak in through the plain spread.
            const salaryKeys = new Set<string>(SALARY_FIELDS);
            const nonSalaryCore = Object.fromEntries(
                Object.entries(coreData).filter(([k]) => !salaryKeys.has(k)),
            );
            // Actors without HRD/Finance/Admin access must not touch salary
            // fields at all — omit them so Prisma leaves existing DB values as-is
            // (setting them to a fallback here would silently wipe real data).
            const salaryUpdate: Record<string, unknown> = {};
            if (canEditSalary) {
                salaryUpdate.overtimeHourlyRate = data.overtimeHourlyRate
                    ? data.overtimeHourlyRate
                    : null;
                salaryUpdate.standardDayHours =
                    data.standardDayHours && data.standardDayHours > 0
                        ? data.standardDayHours
                        : 8;
                if (data.payType !== undefined) {
                    salaryUpdate.payType = data.payType;
                }
                if (data.dailyRate !== undefined) {
                    salaryUpdate.dailyRate = data.dailyRate;
                }
                if (data.monthlySalary !== undefined) {
                    salaryUpdate.monthlySalary = data.monthlySalary;
                }
                if (data.bpjsParticipant !== undefined) {
                    salaryUpdate.bpjsParticipant = data.bpjsParticipant;
                }
                if (data.bpjsEmployeeDeduction !== undefined) {
                    salaryUpdate.bpjsEmployeeDeduction =
                        data.bpjsEmployeeDeduction;
                }
                if (data.bpjsEmployerCost !== undefined) {
                    salaryUpdate.bpjsEmployerCost = data.bpjsEmployerCost;
                }
            }
            const employee = await prisma.employee.update({
                where: { id },
                data: {
                    ...nonSalaryCore,
                    ...salaryUpdate,
                    ...(data.bpjsKesehatanNo !== undefined
                        ? { bpjsKesehatanNo: data.bpjsKesehatanNo || null }
                        : {}),
                    ...(data.bpjsKetenagakerjaanNo !== undefined
                        ? {
                              bpjsKetenagakerjaanNo:
                                  data.bpjsKetenagakerjaanNo || null,
                          }
                        : {}),
                    ...toPersonalDb(_p1),
                },
            });
            // Capture changes only for salary-critical fields.
            const changes: Record<string, { from: unknown; to: unknown }> = {};
            for (const f of SALARY_FIELDS) {
                const oldV = (before as Record<string, unknown>)[f];
                const newV = (employee as Record<string, unknown>)[f];
                if (oldV?.toString() !== newV?.toString()) {
                    changes[f] = { from: oldV, to: newV };
                }
            }
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_UPDATED',
                entityType: 'Employee',
                entityId: employee.id,
                details: `Updated employee ${employee.code} — ${employee.name}`,
                changes: Object.keys(changes).length > 0 ? changes : undefined,
            });
            // Gelombang B3: create salary history snapshot if salary fields changed
            const salaryChanges = buildSalaryChanges(
                before as Record<string, unknown>,
                employee as Record<string, unknown>,
            );
            if (salaryChanges) {
                await createSalaryHistory(
                    prisma,
                    employee.id,
                    employee as Record<string, unknown>,
                    salaryChanges,
                    session.user.id,
                );
            }
            revalidatePath('/dashboard/employees');
            revalidatePath('/production/resources');
            return employee;
        } catch (error) {
            logger.error('Failed to update employee', {
                error,
                employeeId: id,
                module: 'EmployeeActions',
            });
            throw new BusinessRuleError('Gagal memperbarui data personil');
        }
    });
});

export const deleteEmployee = withTenant(async function deleteEmployee(
    id: string,
) {
    return safeAction(async () => {
        try {
            const session = await requireAuth();
            const before = await prisma.employee.findUnique({
                where: { id },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    role: true,
                    payType: true,
                },
            });
            await prisma.employee.delete({
                where: { id },
            });
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_DELETED',
                entityType: 'Employee',
                entityId: id,
                details: before
                    ? `Deleted employee ${before.code} — ${before.name} (role=${before.role}, payType=${before.payType})`
                    : `Deleted employee ${id}`,
            });
            revalidatePath('/dashboard/employees');
            revalidatePath('/production/resources');
            return null;
        } catch (error) {
            logger.error('Failed to delete employee', {
                error,
                employeeId: id,
                module: 'EmployeeActions',
            });
            throw new BusinessRuleError(
                'Tidak dapat menghapus personil. Mungkin terhubung ke riwayat produksi atau shift aktif.',
            );
        }
    });
});

export const generateNextEmployeeCode = withTenant(
    async function generateNextEmployeeCode() {
        return safeAction(async () => {
            try {
                const lastEmployee = await prisma.employee.findFirst({
                    orderBy: {
                        createdAt: 'desc',
                    },
                });

                if (!lastEmployee || !lastEmployee.code) {
                    return 'EMP-001';
                }

                const match = lastEmployee.code.match(/EMP-(\d+)/);
                if (match) {
                    const nextNum = parseInt(match[1]) + 1;
                    return `EMP-${nextNum.toString().padStart(3, '0')}`;
                }

                return `EMP-${Date.now().toString().slice(-3)}`;
            } catch (error) {
                logger.error('Failed to generate next employee code', {
                    error,
                    module: 'EmployeeActions',
                });
                return 'EMP-Unknown';
            }
        });
    },
);
