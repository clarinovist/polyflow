import { getProductionOrders } from '@/actions/production/production-orders';
import { getMachines } from '@/actions/production/machines';
import { getEmployees } from '@/actions/admin/employees';
import { getWorkShifts } from '@/actions/admin/work-shifts';
import { ProductionStatus } from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import PotongPlongProductionForm from "./PotongPlongProductionForm";

export const metadata = {
    title: "Mesin Potong/Plong - Polyflow Kiosk",
};

export default async function PotongPlongKioskPage() {
    // 1. Fetch Orders for Potong/Plong (PACKING/CUTTING category)
    const ordersRes = await getProductionOrders();
    const allOrders = ordersRes;
    const orders = (allOrders as Array<Record<string, unknown>>).filter((o) =>
      [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS].includes(o.status as ProductionStatus)
    );

    // 2. Fetch Machines
    const machinesRes = await getMachines();
    const machines = machinesRes.success && machinesRes.data ? machinesRes.data : [];

    // 3. Fetch Employees (Operator / Helpers)
    const employeesRes = await getEmployees();
    const allEmployees = employeesRes.success && employeesRes.data ? employeesRes.data : [];
    const employees = (allEmployees as Array<Record<string, unknown>>).filter((e) => e.status === 'ACTIVE');

    // 4. Fetch real WorkShifts from DB
    const shiftsRes = await getWorkShifts();
    const allShifts = shiftsRes.success && shiftsRes.data ? shiftsRes.data : [];
    const shifts = (allShifts as Array<Record<string, unknown>>).filter((s) => s.status === 'ACTIVE');

    const serializedOrders = serializeData(orders);
    const serializedMachines = serializeData(machines);
    const serializedEmployees = serializeData(employees);
    const serializedShifts = serializeData(shifts);

    return (
        <div className="min-h-screen bg-slate-950 p-4 md:p-8">
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-8 border-b border-purple-500/30 pb-4">
                Laporan Harian Mesin Potong / Plong
            </h1>
            <PotongPlongProductionForm
                orders={serializedOrders}
                machines={serializedMachines}
                employees={serializedEmployees}
                shifts={serializedShifts}
            />
        </div>
    );
}
