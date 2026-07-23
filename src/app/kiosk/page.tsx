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

    const activeJobCount = await prisma.productionExecution.count({
        where: {
            endTime: null,
            status: 'RUNNING',
        }
    });

    return { employees, machines, activeJobCount };
});

export default async function KioskPage() {
    const { employees, machines, activeJobCount } = await getData();

    return (
        <KioskHub
            employees={employees.map(e => ({
                id: e.id,
                name: e.name,
                machineIds: e.machineAssignments.map(a => a.machineId),
                machineNames: [],
            }))}
            machines={machines}
            activeJobCount={activeJobCount}
        />
    );
}
