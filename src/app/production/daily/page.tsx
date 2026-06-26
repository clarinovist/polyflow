import { auth } from "@/auth";
import { getProductionOrders } from '@/actions/production/production-orders';
import { getBoms } from '@/actions/production/boms';
import { getMachines } from '@/actions/production/machines';
import { ProductionStatus } from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import {
  DailyProductionDashboard,
  type Order,
  type Bom,
  type Machine,
} from "@/components/production/DailyProductionDashboard";

export const dynamic = "force-dynamic";

export default async function DailyProductionPage() {
  const session = await auth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Fetch today's production orders
  const ordersRes = await getProductionOrders();
  const allOrders = ordersRes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (allOrders as any[]).filter((o: any) => {
    const plannedDate = new Date(o.plannedStartDate);
    return plannedDate >= today && plannedDate < tomorrow &&
      [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS, ProductionStatus.WAITING_MATERIAL].includes(o.status);
  });

  // Fetch BOMs with default flag for Quick Produce dialog
  const bomsRes = await getBoms();
  const allBoms = bomsRes.success && bomsRes.data ? bomsRes.data : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boms = (allBoms as any[]).filter((b: any) => b.isDefault);

  // Fetch active machines
  const machinesRes = await getMachines();
  const allMachines = machinesRes.success && machinesRes.data ? machinesRes.data : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const machines = (allMachines as any[]).filter((m: any) => m.status === 'ACTIVE');

  // Aggregate stats
  const stats = {
    total: orders.length,
    running: orders.filter((o) => o.status === ProductionStatus.IN_PROGRESS)
      .length,
    released: orders.filter((o) => o.status === ProductionStatus.RELEASED)
      .length,
    waiting: orders.filter(
      (o) => o.status === ProductionStatus.WAITING_MATERIAL,
    ).length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Produksi Hari Ini
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola produksi harian — tambah produk, pantau progress.
        </p>
      </div>

      <DailyProductionDashboard
        orders={serializeData(orders) as unknown as Order[]}
        boms={serializeData(boms) as unknown as Bom[]}
        machines={serializeData(machines) as unknown as Machine[]}
        stats={stats}
        userId={session?.user?.id}
      />
    </div>
  );
}
