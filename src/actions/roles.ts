'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getJobRoles() {
    try {
        const roles = await prisma.jobRole.findMany({
            orderBy: { name: 'asc' },
        });
        return { success: true, data: roles };
    } catch (error) {
        console.error('Error fetching job roles:', error);
        return { success: false, error: 'Failed to fetch job roles' };
    }
}

export async function createJobRole(name: string) {
    try {
        const role = await prisma.jobRole.create({
            data: { name },
        });
        revalidatePath('/dashboard/production/resources/employees');
        return { success: true, data: role };
    } catch (error) {
        console.error('Error creating job role:', error);
        return { success: false, error: 'Failed to create job role' };
    }
}
