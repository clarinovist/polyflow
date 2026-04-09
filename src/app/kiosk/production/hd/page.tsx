import { prisma } from "@/lib/core/prisma";
import { ProductionStatus } from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import HdProductionForm from "./HdProductionForm";

export const metadata = {
    title: "Mesin HD - Polyflow Kiosk",
};

export default async function HdKioskPage() {
    // 1. Fetch Orders for HD/EXTRUSION category only
    const orders = await prisma.productionOrder.findMany({
        where: {
            status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] },
            bom: { category: 'EXTRUSION' }
        },
        include: {
            bom: {
                include: { productVariant: true }
            },
            machine: true,
        },
        orderBy: { updatedAt: 'desc' }
    });

    // 2. Fetch Machines
    const machines = await prisma.machine.findMany({
        orderBy: { name: 'asc' }
    });

    // 3. Fetch Employees (Operator / Helpers)
    const employees = await prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' }
    });

    // 4. Fetch real WorkShifts from DB
    const shifts = await prisma.workShift.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' }
    });

    const serializedOrders = serializeData(orders);
    const serializedMachines = serializeData(machines);
    const serializedEmployees = serializeData(employees);
    const serializedShifts = serializeData(shifts);

    return (
        <div className="min-h-screen bg-slate-950 p-4 md:p-8">
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-8 border-b border-primary/20 pb-4">
                Laporan Harian Mesin HD
            </h1>
            <HdProductionForm
                orders={serializedOrders}
                machines={serializedMachines}
                employees={serializedEmployees}
                shifts={serializedShifts}
            />
        </div>
    );
}
