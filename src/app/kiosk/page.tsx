import { prisma } from '@/lib/core/prisma';
import { redirect } from 'next/navigation';
import { withTenantPage } from '@/lib/core/tenant';
import { readKioskFeatureSettings } from '@/services/settings/kiosk-feature-service';
import { KioskHub } from '@/components/kiosk/KioskHub';
import { RUNNING_EXECUTION_WHERE } from '@/lib/production/execution-running';

const getData = withTenantPage(async function getData() {
    const hasProsesKhusus = await readKioskFeatureSettings();

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

    const machines = await prisma.machine.findMany({
        select: {
            id: true,
            name: true,
        },
    });

    // Fallback: jika MachineOperator kosong, ambil mesin dari ProductionExecution terbaru per operator
    const operatorIds = employees.map((e) => e.id);
    const executionMachines =
        operatorIds.length > 0
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

    // Operators with a running shell, for the gate's "Sedang jalan" filter.
    const running = await prisma.productionExecution.findMany({
        where: { ...RUNNING_EXECUTION_WHERE, operatorId: { not: null } },
        select: { operatorId: true },
        distinct: ['operatorId'],
    });
    const runningOperatorIds = running
        .map((execution) => execution.operatorId)
        .filter((id): id is string => !!id);

    return {
        employees,
        machines,
        machinesByOperator,
        runningOperatorIds,
        hasProsesKhusus,
    };
});

export default async function KioskPage({
    searchParams,
}: {
    searchParams?: Promise<{ orderId?: string }>;
}) {
    const orderId = (await searchParams)?.orderId;
    if (orderId) redirect(`/kiosk/jobs/${orderId}`);
    const {
        employees,
        machines,
        machinesByOperator,
        runningOperatorIds,
        hasProsesKhusus,
    } = await getData();

    return (
        <KioskHub
            employees={employees.map((e) => ({
                id: e.id,
                name: e.name,
                machineIds:
                    e.machineAssignments.length > 0
                        ? e.machineAssignments.map((a) => a.machineId)
                        : (machinesByOperator.get(e.id) ?? []),
                machineNames: [],
            }))}
            machines={machines}
            runningOperatorIds={runningOperatorIds}
            hasProsesKhusus={hasProsesKhusus}
        />
    );
}
