'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { MachineType, MachineStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

export const getMachines = withTenant(
async function getMachines() {
    return safeAction(async () => {
        try {
            const machines = await prisma.machine.findMany({
                include: { location: true },
                orderBy: { code: 'asc' },
            });
            return machines;
        } catch (error) {
            logger.error('Failed to get machines', { error, module: 'MachineActions' });
            throw new BusinessRuleError('Failed to retrieve production fleet. Please try again later.');
        }
    });
}
);

export const getMachineById = withTenant(
async function getMachineById(id: string) {
    return safeAction(async () => {
        try {
            const machine = await prisma.machine.findUnique({
                where: { id },
                include: { location: true },
            });
            if (!machine) throw new NotFoundError('Machine', id);
            return machine;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error('Failed to get machine by ID', { machineId: id, error, module: 'MachineActions' });
            throw new BusinessRuleError('Database error occurred while fetching machine details.');
        }
    });
}
);

export const createMachine = withTenant(
async function createMachine(data: {
    name: string;
    code: string;
    type: MachineType;
    locationId: string;
    status?: MachineStatus;
    costPerHour?: number;
}) {
    return safeAction(async () => {
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
            return machine;
        } catch (error) {
            logger.error('Failed to create machine', { error, module: 'MachineActions' });
            throw new BusinessRuleError('Failed to register machine. Please verify the input data.');
        }
    });
}
);

export const updateMachine = withTenant(
async function updateMachine(
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
    return safeAction(async () => {
        try {
            const machine = await prisma.machine.update({
                where: { id },
                data,
            });
            revalidatePath('/dashboard/machines');
            revalidatePath('/production/machines');
            return machine;
        } catch (error) {
            logger.error('Failed to update machine', { machineId: id, error, module: 'MachineActions' });
            throw new BusinessRuleError('Failed to update machine configuration. Please try again.');
        }
    });
}
);

export const deleteMachine = withTenant(
async function deleteMachine(id: string) {
    return safeAction(async () => {
        try {
            await prisma.machine.delete({
                where: { id },
            });
            revalidatePath('/dashboard/machines');
            revalidatePath('/production/machines');
            return null;
        } catch (error) {
            logger.error('Failed to delete machine', { machineId: id, error, module: 'MachineActions' });
            throw new BusinessRuleError('Cannot delete machine. It may have linked production history.');
        }
    });
}
);

export const setMachineStatus = withTenant(
async function setMachineStatus(id: string, status: MachineStatus) {
    return safeAction(async () => {
        try {
            const machine = await prisma.machine.update({
                where: { id },
                data: { status }
            });
            revalidatePath('/dashboard/machines');
            revalidatePath('/production/machines');
            return machine;
        } catch (error) {
            logger.error('Failed to set machine status', { machineId: id, status, error, module: 'MachineActions' });
            throw new BusinessRuleError(`Failed to transition machine to ${status}. Please try again.`);
        }
    });
}
);
