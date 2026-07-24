import { getProductionOrders } from '@/actions/production/production-orders';
import { getMachines } from '@/actions/production/machines';
import { getEmployees } from '@/actions/admin/employees';
import { ProductionStatus } from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import PotongPlongProductionForm from "./PotongPlongProductionForm";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: "Mesin Potong/Plong - Polyflow Kiosk",
};

export default async function PotongPlongKioskPage() {
    const ordersRes = await getProductionOrders();
    const allOrders = ordersRes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = (allOrders as any[]).filter((o: any) =>
      [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS].includes(o.status)
    );

    const machinesRes = await getMachines();
    const machines = machinesRes.success && machinesRes.data ? machinesRes.data : [];

    const employeesRes = await getEmployees();
    const allEmployees = employeesRes.success && employeesRes.data ? employeesRes.data : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees = (allEmployees as any[]).filter((e: any) => e.status === 'ACTIVE');

    const serializedOrders = serializeData(orders);
    const serializedMachines = serializeData(machines);
    const serializedEmployees = serializeData(employees);

    return (
        <div className="min-h-screen bg-background p-4 md:p-6 max-w-7xl mx-auto space-y-4">
            <Link href="/kiosk">
                <Button variant="ghost" size="icon" className="h-10 w-10" title="Kembali ke Hub">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
            </Link>
            <div className="bg-card border-2 rounded-2xl p-4 md:p-6">
                <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mb-6">
                    Laporan Harian Mesin Potong / Plong
                </h1>
                <PotongPlongProductionForm
                    orders={serializedOrders}
                    machines={serializedMachines}
                    employees={serializedEmployees}
                />
            </div>
        </div>
    );
}
