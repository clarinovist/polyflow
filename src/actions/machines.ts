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
        return machines;
    } catch (error) {
        console.error('Failed to fetch machines:', error);
        throw new Error('Failed to fetch machines');
    }
}

export async function getMachineById(id: string) {
    try {
        const machine = await prisma.machine.findUnique({
            where: { id },
            include: { location: true },
        });
        return machine;
    } catch (error) {
        console.error('Failed to fetch machine:', error);
        return null;
    }
}

export async function createMachine(data: {
    name: string;
    code: string;
    type: MachineType;
    locationId: string;
    status?: MachineStatus;
}) {
    try {
        const machine = await prisma.machine.create({
            data: {
                name: data.name,
                code: data.code,
                type: data.type,
                locationId: data.locationId,
                status: data.status || 'ACTIVE',
            },
        });
        revalidatePath('/dashboard/production/resources/machines');
        return { success: true, data: machine };
    } catch (error) {
        console.error('Failed to create machine:', error);
        return { success: false, error: 'Failed to create machine' };
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
    }
) {
    try {
        const machine = await prisma.machine.update({
            where: { id },
            data,
        });
        revalidatePath('/dashboard/production/resources/machines');
        return { success: true, data: machine };
    } catch (error) {
        console.error('Failed to update machine:', error);
        return { success: false, error: 'Failed to update machine' };
    }
}

export async function deleteMachine(id: string) {
    try {
        await prisma.machine.delete({
            where: { id },
        });
        revalidatePath('/dashboard/production/resources/machines');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete machine:', error);
        return { success: false, error: 'Failed to delete machine' };
    }
}

export async function setMachineStatus(id: string, status: MachineStatus) {
    try {
        const machine = await prisma.machine.update({
            where: { id },
            data: { status }
        });
        revalidatePath('/dashboard/production/resources/machines');
        return { success: true, data: machine };
    } catch (error) {
        console.error('Failed to update machine status:', error);
        return { success: false, error: 'Failed to update machine status' };
    }
}
