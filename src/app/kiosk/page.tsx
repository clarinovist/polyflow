import { prisma } from "@/lib/core/prisma";
import { withTenantPage } from "@/lib/core/tenant";
import { KioskHub } from "@/components/kiosk/KioskHub";

const getData = withTenantPage(async function getData() {
    const employees = await prisma.employee.findMany({
        where: {
            status: 'ACTIVE',
            role: 'OPERATOR'
        },
        select: {
            id: true,
            name: true,
            machineAssignments: {
                select: {
                    machineId: true,
                    isPrimary: true,
                }
            }
        }
    });

    const machines = await prisma.machine.findMany({
        select: {
            id: true,
            name: true,
        }
    });

    // Fallback: jika MachineOperator kosong, ambil mesin dari ProductionExecution terbaru per operator
    const operatorIds = employees.map(e => e.id);
    const executionMachines = operatorIds.length > 0
        ? await prisma.productionExecution.findMany({
            where: {
                operatorId: { in: operatorIds },
                machineId: { not: null },
            },
            select: {
                operatorId: true,
                machineId: true,
                startTime: true,
            },
            orderBy: { startTime: 'desc' },
        })
        : [];

    const machinesByOperator = new Map<string, string[]>();
    for (const ex of executionMachines) {
        if (!ex.operatorId || !ex.machineId) continue;
        const list = machinesByOperator.get(ex.operatorId) ?? [];
        if (!list.includes(ex.machineId)) {
            list.push(ex.machineId);
            machinesByOperator.set(ex.operatorId, list);
        }
    }

    const activeJobCount = await prisma.productionExecution.count({
        where: {
            endTime: null,
            status: 'RUNNING',
        }
    });

    return { employees, machines, activeJobCount, machinesByOperator };
});

export default async function KioskPage() {
    const { employees, machines, activeJobCount, machinesByOperator } = await getData();

    return (
        <KioskHub
            employees={employees.map(e => ({
                id: e.id,
                name: e.name,
                machineIds: e.machineAssignments.length > 0
                    ? e.machineAssignments.map(a => a.machineId)
                    : (machinesByOperator.get(e.id) ?? []),
                machineNames: [],
            }))}
            machines={machines}
            activeJobCount={activeJobCount}
        />
    );
}
