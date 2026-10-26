import { redirect } from 'next/navigation';
import { getProductionOrders } from '@/actions/production/production-orders';
import { getMachines } from '@/actions/production/machines';
import { getEmployees } from '@/actions/admin/employees';
import { ProductionStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { readKioskFeatureSettings } from '@/services/settings/kiosk-feature-service';
import PotongPlongProductionForm from './PotongPlongProductionForm';
import Link from 'next/link';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: 'Mesin Potong/Plong - Polyflow Kiosk',
};

const getData = withTenantPage(async function getData() {
    const hasProsesKhusus = await readKioskFeatureSettings();
    if (!hasProsesKhusus) {
        redirect('/kiosk');
    }

    const allOrders = await getProductionOrders();
    const orders = allOrders.filter((o) =>
        (
            [
                ProductionStatus.RELEASED,
                ProductionStatus.IN_PROGRESS,
            ] as ProductionStatus[]
        ).includes(o.status),
    );

    const machinesRes = await getMachines();
    const machines =
        machinesRes.success && machinesRes.data ? machinesRes.data : [];

    const employeesRes = await getEmployees();
    const allEmployees =
        employeesRes.success && employeesRes.data ? employeesRes.data : [];
    const employees = allEmployees.filter((e) => e.status === 'ACTIVE');

    return {
        // Public client props: never serialize whole employee, machine or product records.
        orders: serializeData(
            orders.map((order) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                bom: {
                    productVariant: {
                        name: order.bom.productVariant.name,
                        primaryUnit: order.bom.productVariant.primaryUnit,
                        salesUnit: order.bom.productVariant.salesUnit,
                        conversionFactor:
                            order.bom.productVariant.conversionFactor,
                    },
                },
            })),
        ),
        machines: machines.map(({ id, name }) => ({ id, name })),
        employees: employees.map(({ id, name }) => ({ id, name })),
    };
});

export default async function PotongPlongKioskPage() {
    const { orders, machines, employees } = await getData();

    return (
        <div className="bg-background p-4 md:p-6 max-w-7xl mx-auto space-y-4">
            <Link href="/kiosk" className={kioskButton({ tone: 'ghost' })}>
                <ArrowLeft aria-hidden="true" /> Kembali ke hub
            </Link>
            <div className="bg-card border-2 rounded-2xl p-4 md:p-6">
                <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mb-6">
                    Laporan Harian Mesin Potong / Plong
                </h1>
                <PotongPlongProductionForm
                    orders={orders}
                    machines={machines}
                    employees={employees}
                />
            </div>
        </div>
    );
}
