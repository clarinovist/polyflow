'use server';

import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, ConflictError, NotFoundError } from '@/lib/errors/errors';
import { revalidatePath } from 'next/cache';

/**
 * Get all operators assigned to a specific machine
 */
export const getMachineOperators = withTenant(
    async function getMachineOperators(machineId: string) {
        return safeAction(async () => {
            const operators = await prisma.machineOperator.findMany({
                where: { machineId },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            role: true,
                            status: true,
                        }
                    }
                },
                orderBy: [
                    { isPrimary: 'desc' },
                    { assignedAt: 'asc' }
                ]
            });

            return operators;
        });
    }
);

/**
 * Get all machines assigned to a specific operator
 */
export const getOperatorMachines = withTenant(
    async function getOperatorMachines(employeeId: string) {
        return safeAction(async () => {
            const machines = await prisma.machineOperator.findMany({
                where: { employeeId },
                include: {
                    machine: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            type: true,
                            status: true,
                            location: {
                                select: {
                                    name: true,
                                }
                            }
                        }
                    }
                },
                orderBy: [
                    { isPrimary: 'desc' },
                    { assignedAt: 'asc' }
                ]
            });

            return machines;
        });
    }
);

/**
 * Assign an operator to a machine
 */
export const assignOperator = withTenant(
    async function assignOperator(data: {
        machineId: string;
        employeeId: string;
        isPrimary?: boolean;
        notes?: string;
    }) {
        return safeAction(async () => {
            // Check if assignment already exists
            const existing = await prisma.machineOperator.findUnique({
                where: {
                    machineId_employeeId: {
                        machineId: data.machineId,
                        employeeId: data.employeeId,
                    }
                }
            });

            if (existing) {
                throw new ConflictError('Operator already assigned to this machine');
            }

            // If setting as primary, unset any existing primary
            if (data.isPrimary) {
                await prisma.machineOperator.updateMany({
                    where: {
                        machineId: data.machineId,
                        isPrimary: true,
                    },
                    data: { isPrimary: false }
                });
            }

            const assignment = await prisma.machineOperator.create({
                data: {
                    machineId: data.machineId,
                    employeeId: data.employeeId,
                    isPrimary: data.isPrimary ?? false,
                    notes: data.notes,
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        }
                    },
                    machine: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        }
                    }
                }
            });

            revalidatePath('/production/machines');
            revalidatePath('/kiosk');

            return assignment;
        });
    }
);

/**
 * Unassign an operator from a machine
 */
export const unassignOperator = withTenant(
    async function unassignOperator(data: {
        machineId: string;
        employeeId: string;
    }) {
        return safeAction(async () => {
            const assignment = await prisma.machineOperator.findUnique({
                where: {
                    machineId_employeeId: {
                        machineId: data.machineId,
                        employeeId: data.employeeId,
                    }
                }
            });

            if (!assignment) {
                throw new NotFoundError("Machine Operator Assignment");
            }

            await prisma.machineOperator.delete({
                where: {
                    machineId_employeeId: {
                        machineId: data.machineId,
                        employeeId: data.employeeId,
                    }
                }
            });

            revalidatePath('/production/machines');
            revalidatePath('/kiosk');

            return { success: true };
        });
    }
);

/**
 * Set an operator as primary for a machine
 */
export const setPrimaryOperator = withTenant(
    async function setPrimaryOperator(data: {
        machineId: string;
        employeeId: string;
    }) {
        return safeAction(async () => {
            // Unset any existing primary
            await prisma.machineOperator.updateMany({
                where: {
                    machineId: data.machineId,
                    isPrimary: true,
                },
                data: { isPrimary: false }
            });

            // Set the new primary
            const assignment = await prisma.machineOperator.update({
                where: {
                    machineId_employeeId: {
                        machineId: data.machineId,
                        employeeId: data.employeeId,
                    }
                },
                data: { isPrimary: true },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        }
                    }
                }
            });

            revalidatePath('/production/machines');

            return assignment;
        });
    }
);

/**
 * Get machines for kiosk filtering based on operator
 * Returns machine IDs that the operator is assigned to
 */
export const getOperatorMachineIds = withTenant(
    async function getOperatorMachineIds(employeeId: string) {
        return safeAction(async () => {
            const assignments = await prisma.machineOperator.findMany({
                where: { employeeId },
                select: { machineId: true }
            });

            return assignments.map((a: { machineId: string }) => a.machineId);
        });
    }
);
