'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { EmployeeStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

export const getEmployees = withTenant(
async function getEmployees() {
    return safeAction(async () => {
        try {
            const employees = await prisma.employee.findMany({
                orderBy: { createdAt: 'desc' },
            });
            return employees;
        } catch (error) {
            logger.error('Failed to get employees', { error, module: 'EmployeeActions' });
            throw new BusinessRuleError('Failed to retrieve personnel directory');
        }
    });
}
);

export const getEmployeeById = withTenant(
async function getEmployeeById(id: string) {
    return safeAction(async () => {
        try {
            const employee = await prisma.employee.findUnique({
                where: { id },
            });
            if (!employee) {
                throw new BusinessRuleError('Employee not found');
            }
            return employee;
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to get employee', { error, employeeId: id, module: 'EmployeeActions' });
            throw new BusinessRuleError('Database error occurred while fetching employee');
        }
    });
}
);

export const createEmployee = withTenant(
async function createEmployee(data: {
    name: string;
    code: string;
    role: string;
    status?: EmployeeStatus;
    hourlyRate?: number;
}) {
    return safeAction(async () => {
        try {
            const employee = await prisma.employee.create({
                data: {
                    name: data.name,
                    code: data.code,
                    role: data.role,
                    status: data.status || 'ACTIVE',
                    hourlyRate: data.hourlyRate || 0,
                },
            });
            revalidatePath('/dashboard/employees');
            revalidatePath('/production/resources');
            return employee;
        } catch (error) {
            logger.error('Failed to create employee', { error, module: 'EmployeeActions' });
            throw new BusinessRuleError('Failed to onboard personnel');
        }
    });
}
);

export const updateEmployee = withTenant(
async function updateEmployee(
    id: string,
    data: {
        name?: string;
        code?: string;
        role?: string;
        status?: EmployeeStatus;
        hourlyRate?: number;
    }
) {
    return safeAction(async () => {
        try {
            const employee = await prisma.employee.update({
                where: { id },
                data,
            });
            revalidatePath('/dashboard/employees');
            revalidatePath('/production/resources');
            return employee;
        } catch (error) {
            logger.error('Failed to update employee', { error, employeeId: id, module: 'EmployeeActions' });
            throw new BusinessRuleError('Failed to update personnel records');
        }
    });
}
);

export const deleteEmployee = withTenant(
async function deleteEmployee(id: string) {
    return safeAction(async () => {
        try {
            await prisma.employee.delete({
                where: { id },
            });
            revalidatePath('/dashboard/employees');
            revalidatePath('/production/resources');
            return null;
        } catch (error) {
            logger.error('Failed to delete employee', { error, employeeId: id, module: 'EmployeeActions' });
            throw new BusinessRuleError('Cannot delete personnel. They may be linked to production history or active shifts.');
        }
    });
}
);

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
            logger.error('Failed to generate next employee code', { error, module: 'EmployeeActions' });
            return 'EMP-Unknown';
        }
    });
}
);
