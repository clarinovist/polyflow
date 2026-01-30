'use server';

import { prisma } from '@/lib/prisma';
import { EmployeeStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getEmployees() {
    try {
        const employees = await prisma.employee.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: employees };
    } catch (error) {
        console.error('[GET_EMPLOYEES_ERROR]', error);
        return { success: false, error: 'Failed to retrieve personnel directory' };
    }
}

export async function getEmployeeById(id: string) {
    try {
        const employee = await prisma.employee.findUnique({
            where: { id },
        });
        if (!employee) {
            return { success: false, error: 'Employee not found' };
        }
        return { success: true, data: employee };
    } catch (error) {
        console.error(`[GET_EMPLOYEE_BY_ID_ERROR] ID: ${id}`, error);
        return { success: false, error: 'Database error occurred while fetching employee' };
    }
}

export async function createEmployee(data: {
    name: string;
    code: string;
    role: string;
    status?: EmployeeStatus;
    hourlyRate?: number;
}) {
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
        return { success: true, data: employee };
    } catch (error) {
        console.error('[CREATE_EMPLOYEE_ERROR]', error);
        return { success: false, error: 'Failed to onboard personnel' };
    }
}

export async function updateEmployee(
    id: string,
    data: {
        name?: string;
        code?: string;
        role?: string;
        status?: EmployeeStatus;
        hourlyRate?: number;
    }
) {
    try {
        const employee = await prisma.employee.update({
            where: { id },
            data,
        });
        revalidatePath('/dashboard/employees');
        revalidatePath('/production/resources');
        return { success: true, data: employee };
    } catch (error) {
        console.error(`[UPDATE_EMPLOYEE_ERROR] ID: ${id}`, error);
        return { success: false, error: 'Failed to update personnel records' };
    }
}

export async function deleteEmployee(id: string) {
    try {
        // Check if employee has associated records (e.g. executions) before deleting
        // This is a safety check usually handled by foreign key constraints but managed here for clarity
        await prisma.employee.delete({
            where: { id },
        });
        revalidatePath('/dashboard/employees');
        revalidatePath('/production/resources');
        return { success: true };
    } catch (error) {
        console.error(`[DELETE_EMPLOYEE_ERROR] ID: ${id}`, error);
        return { success: false, error: 'Cannot delete personnel. They may be linked to production history or active shifts.' };
    }
}

export async function generateNextEmployeeCode() {
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
        console.error('[GENERATE_EMPLOYEE_CODE_ERROR]', error);
        return 'EMP-Unknown';
    }
}
