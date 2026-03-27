'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

const DEFAULT_JOB_ROLES = ['OPERATOR', 'HELPER', 'PACKER', 'MANAGER'];

export const getJobRoles = withTenant(
async function getJobRoles() {
    return safeAction(async () => {
        try {
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

            return roles;
        } catch (error) {
            logger.error('Failed to fetch job roles', { error, module: 'RoleActions' });
            throw new BusinessRuleError('Failed to fetch job roles');
        }
    });
}
);

export const createJobRole = withTenant(
async function createJobRole(name: string) {
    return safeAction(async () => {
        try {
            const role = await prisma.jobRole.create({
                data: { name },
            });
            revalidatePath('/dashboard/employees');
            revalidatePath('/production/resources');
            return role;
        } catch (error) {
            logger.error('Failed to create job role', { error, roleName: name, module: 'RoleActions' });
            throw new BusinessRuleError('Failed to create job role');
        }
    });
}
);
