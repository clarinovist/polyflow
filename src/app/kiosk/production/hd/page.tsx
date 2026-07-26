import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getProductionOrders } from '@/actions/production/production-orders';
import { getMachines } from '@/actions/production/machines';
import { getEmployees } from '@/actions/admin/employees';
import { ProductionStatus } from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import { extractSubdomain } from '@/lib/core/subdomain';
import { tenantHasProsesKhusus } from '@/lib/kiosk/tenant-features';
import HdProductionForm from "./HdProductionForm";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: "Mesin HD - Polyflow Kiosk",
};

export default async function HdKioskPage() {
    const h = await headers();
    const subdomain =
        h.get('x-tenant-subdomain') || extractSubdomain(h.get('host') || '') || null;
    if (!tenantHasProsesKhusus(subdomain)) {
        redirect('/kiosk');
    }

    const ordersRes = await getProductionOrders();
    const allOrders = ordersRes;
    const orders = allOrders.filter((o) =>
      ([ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] as ProductionStatus[]).includes(o.status)
    );

    const machinesRes = await getMachines();
    const machines = machinesRes.success && machinesRes.data ? machinesRes.data : [];

    const employeesRes = await getEmployees();
    const allEmployees = employeesRes.success && employeesRes.data ? employeesRes.data : [];
    const employees = allEmployees.filter((e) => e.status === 'ACTIVE');

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
                    Laporan Harian Mesin HD
                </h1>
                <HdProductionForm
                    orders={serializedOrders}
                    machines={serializedMachines}
                    employees={serializedEmployees}
                />
            </div>
        </div>
    );
}
