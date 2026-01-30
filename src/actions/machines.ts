'use server';

import { prisma } from '@/lib/prisma';
import { MachineType, MachineStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getMachines() {
    try {
        const machines = await prisma.machine.findMany({
            include: { location: true },
            orderBy: { code: 'asc' },
        });
        return { success: true, data: machines };
    } catch (error) {
        console.error('[GET_MACHINES_ERROR]', error);
        return { success: false, error: 'Failed to retrieve production fleet' };
    }
}

export async function getMachineById(id: string) {
    try {
        const machine = await prisma.machine.findUnique({
            where: { id },
            include: { location: true },
        });
        if (!machine) {
            return { success: false, error: 'Machine not found' };
        }
        return { success: true, data: machine };
    } catch (error) {
        console.error(`[GET_MACHINE_BY_ID_ERROR] ID: ${id}`, error);
        return { success: false, error: 'Database error occurred while fetching machine' };
    }
}

export async function createMachine(data: {
    name: string;
    code: string;
    type: MachineType;
    locationId: string;
    status?: MachineStatus;
    costPerHour?: number;
}) {
    try {
        const machine = await prisma.machine.create({
            data: {
                name: data.name,
                code: data.code,
                type: data.type,
                locationId: data.locationId,
                status: data.status || 'ACTIVE',
                costPerHour: data.costPerHour || 0,
            },
        });
        revalidatePath('/dashboard/machines');
        revalidatePath('/production/machines');
        return { success: true, data: machine };
    } catch (error) {
        console.error('[CREATE_MACHINE_ERROR]', error);
        return { success: false, error: 'Failed to register machine' };
    }
}

export async function updateMachine(
    id: string,
    data: {
        name?: string;
        code?: string;
        type?: MachineType;
        locationId?: string;
        status?: MachineStatus;
        costPerHour?: number;
    }
) {
    try {
        const machine = await prisma.machine.update({
            where: { id },
            data,
        });
        revalidatePath('/dashboard/machines');
        revalidatePath('/production/machines');
        return { success: true, data: machine };
    } catch (error) {
        console.error(`[UPDATE_MACHINE_ERROR] ID: ${id}`, error);
        return { success: false, error: 'Failed to update machine configuration' };
    }
}

export async function deleteMachine(id: string) {
    try {
        await prisma.machine.delete({
            where: { id },
        });
        revalidatePath('/dashboard/machines');
        revalidatePath('/production/machines');
        return { success: true };
    } catch (error) {
        console.error(`[DELETE_MACHINE_ERROR] ID: ${id}`, error);
        return { success: false, error: 'Cannot delete machine. It may have linked production history.' };
    }
}

export async function setMachineStatus(id: string, status: MachineStatus) {
    try {
        const machine = await prisma.machine.update({
            where: { id },
            data: { status }
        });
        revalidatePath('/dashboard/machines');
        revalidatePath('/production/machines');
        return { success: true, data: machine };
    } catch (error) {
        console.error(`[SET_MACHINE_STATUS_ERROR] ID: ${id} Status: ${status}`, error);
        return { success: false, error: `Failed to transition machine to ${status}` };
    }
}
