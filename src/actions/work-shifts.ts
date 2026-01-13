'use server';

import { prisma as db } from '@/lib/prisma';
import { WorkShiftStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getWorkShifts() {
    try {
        const shifts = await db.workShift.findMany({
            orderBy: {
                startTime: 'asc',
            },
        });
        return { success: true, data: shifts };
    } catch (error) {
        console.error('Error fetching work shifts:', error);
        return { success: false, error: 'Failed to fetch work shifts' };
    }
}

export async function createWorkShift(data: {
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
        console.error('Error creating work shift:', error);
        return { success: false, error: 'Failed to create work shift' };
    }
}

export async function updateWorkShift(
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
        console.error('Error updating work shift:', error);
        return { success: false, error: 'Failed to update work shift' };
    }
}

export async function deleteWorkShift(id: string) {
    try {
        // Check if there are any dependencies if needed (e.g. if we link production shifts to work shifts later)
        // For now, simple delete
        await db.workShift.delete({
            where: { id },
        });
        revalidatePath('/dashboard/settings/shifts');
        return { success: true };
    } catch (error) {
        console.error('Error deleting work shift:', error);
        return { success: false, error: 'Failed to delete work shift' };
    }
}
