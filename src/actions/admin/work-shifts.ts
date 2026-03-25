'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma as db } from '@/lib/core/prisma';
import { WorkShiftStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';

export const getWorkShifts = withTenant(
async function getWorkShifts() {
    try {
        const shifts = await db.workShift.findMany({
            orderBy: {
                startTime: 'asc',
            },
        });
        return { success: true, data: shifts };
    } catch (error) {
        logger.error('Failed to fetch work shifts', { error, module: 'WorkShiftActions' });
        return { success: false, error: 'Failed to fetch work shifts' };
    }
}
);

export const createWorkShift = withTenant(
async function createWorkShift(data: {
    name: string;
    startTime: string;
    endTime: string;
    status: WorkShiftStatus;
}) {
    try {
        const shift = await db.workShift.create({
            data: {
                name: data.name,
                startTime: data.startTime,
                endTime: data.endTime,
                status: data.status,
            },
        });
        revalidatePath('/dashboard/settings/shifts');
        return { success: true, data: shift };
    } catch (error) {
        logger.error('Failed to create work shift', { error, module: 'WorkShiftActions' });
        return { success: false, error: 'Failed to create work shift' };
    }
}
);

export const updateWorkShift = withTenant(
async function updateWorkShift(
    id: string,
    data: {
        name: string;
        startTime: string;
        endTime: string;
        status: WorkShiftStatus;
    }
) {
    try {
        const shift = await db.workShift.update({
            where: { id },
            data: {
                name: data.name,
                startTime: data.startTime,
                endTime: data.endTime,
                status: data.status,
            },
        });
        revalidatePath('/dashboard/settings/shifts');
        return { success: true, data: shift };
    } catch (error) {
        logger.error('Failed to update work shift', { error, shiftId: id, module: 'WorkShiftActions' });
        return { success: false, error: 'Failed to update work shift' };
    }
}
);

export const deleteWorkShift = withTenant(
async function deleteWorkShift(id: string) {
    try {
        // Check if there are any dependencies if needed (e.g. if we link production shifts to work shifts later)
        // For now, simple delete
        await db.workShift.delete({
            where: { id },
        });
        revalidatePath('/dashboard/settings/shifts');
        return { success: true };
    } catch (error) {
        logger.error('Failed to delete work shift', { error, shiftId: id, module: 'WorkShiftActions' });
        return { success: false, error: 'Failed to delete work shift' };
    }
}
);
