import { prisma } from '@/lib/core/prisma';
import { withTenantPage } from '@/lib/core/tenant';
import { listKioskJobs } from '@/services/production/kiosk-job-service';
import KioskJobList from './KioskJobList';

const getData = withTenantPage(async function getData() {
    // Narrow DTOs only: this page is public and every prop reaches the browser.
    const jobs = await listKioskJobs();

    const employees = await prisma.employee.findMany({
        where: {
            status: 'ACTIVE',
            role: 'OPERATOR',
        },
        select: {
            id: true,
            name: true,
            machineAssignments: {
                select: {
                    machineId: true,
                    isPrimary: true,
                },
            },
        },
    });

    // Fallback: jika MachineOperator kosong, ambil mesin dari ProductionExecution terbaru per operator
    const employeeIds = employees.map((e) => e.id);
    const executionMachines =
        employeeIds.length > 0
            ? await prisma.productionExecution.findMany({
                  where: {
                      operatorId: { in: employeeIds },
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

    const machines = await prisma.machine.findMany({
        select: { id: true, name: true },
    });

    return { jobs, employees, machines, machinesByOperator };
});

export const metadata = {
    title: 'SPK saya - Kiosk',
};

export default async function KioskJobsPage() {
    const { jobs, employees, machines, machinesByOperator } = await getData();

    return (
        <div className="mx-auto h-full max-w-7xl p-4 md:p-6">
            <KioskJobList
                jobs={jobs}
                employees={employees.map((e) => ({
                    id: e.id,
                    name: e.name,
                    machineIds:
                        e.machineAssignments.length > 0
                            ? e.machineAssignments.map((a) => a.machineId)
                            : (machinesByOperator.get(e.id) ?? []),
                }))}
                machines={machines}
            />
        </div>
    );
}
