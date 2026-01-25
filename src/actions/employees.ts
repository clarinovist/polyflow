'use server';

import { prisma } from '@/lib/prisma';
import { EmployeeStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getEmployees() {
    try {
        const employees = await prisma.employee.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return employees;
    } catch (error) {
        console.error('Failed to fetch employees:', error);
        throw new Error('Failed to fetch employees');
    }
}

export async function getEmployeeById(id: string) {
    try {
        const employee = await prisma.employee.findUnique({
            where: { id },
        });
        return employee;
    } catch (error) {
        console.error('Failed to fetch employee:', error);
        return null;
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
        return { success: true, data: employee };
    } catch (error) {
        console.error('Failed to create employee:', error);
        return { success: false, error: 'Failed to create employee' };
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
        return { success: true, data: employee };
    } catch (error) {
        console.error('Failed to update employee:', error);
        return { success: false, error: 'Failed to update employee' };
    }
}

export async function deleteEmployee(id: string) {
    try {
        await prisma.employee.delete({
            where: { id },
        });
        revalidatePath('/dashboard/employees');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete employee:', error);
        return { success: false, error: 'Failed to delete employee' };
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
        console.error('Failed to generate employee code:', error);
        return 'EMP-Unknown';
    }
}
