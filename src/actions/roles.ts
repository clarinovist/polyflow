'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-checks';

const DEFAULT_JOB_ROLES = ['OPERATOR', 'HELPER', 'PACKER', 'MANAGER'];

export async function getJobRoles() {
    try {
        await requireAuth();
        let roles = await prisma.jobRole.findMany({
            orderBy: { name: 'asc' },
        });

        if (roles.length === 0) {
            await prisma.jobRole.createMany({
                data: DEFAULT_JOB_ROLES.map((name) => ({ name })),
                skipDuplicates: true,
            });
            roles = await prisma.jobRole.findMany({ orderBy: { name: 'asc' } });
        }

        return { success: true, data: roles };
    } catch (error) {
        console.error('Error fetching job roles:', error);
        return { success: false, error: 'Failed to fetch job roles' };
    }
}

export async function createJobRole(name: string) {
    try {
        await requireAuth();
        const role = await prisma.jobRole.create({
            data: { name },
        });
        revalidatePath('/dashboard/employees');
        revalidatePath('/production/resources');
        return { success: true, data: role };
    } catch (error) {
        console.error('Error creating job role:', error);
        return { success: false, error: 'Failed to create job role' };
    }
}
