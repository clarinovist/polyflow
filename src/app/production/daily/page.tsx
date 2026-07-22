import { auth } from "@/auth";
import { getProductionOrders } from '@/actions/production/production-orders';
import { getBoms } from '@/actions/production/boms';
import { getMachines } from '@/actions/production/machines';
import { ProductionStatus } from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import Link from "next/link";
import {
  DailyProductionDashboard,
  type Order,
  type Bom,
  type Machine,
} from "@/components/production/DailyProductionDashboard";

export const dynamic = "force-dynamic";

export default async function DailyProductionPage() {
  const session = await auth();

  // Fetch all production orders, then filter by active status
  // This includes orders from previous days that are still in progress
  const ordersRes = await getProductionOrders();
  const allOrders = ordersRes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (allOrders as any[]).filter((o: any) =>
    [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS, ProductionStatus.WAITING_MATERIAL].includes(o.status)
  );

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          SPK Aktif
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Board per proses — SPK aktif termasuk yang terbawa dari hari sebelumnya.
        </p>
        <div className="flex flex-wrap gap-3 mt-2 text-xs font-semibold">
          <Link href="/production" className="text-primary hover:underline">← Papan Produksi</Link>
          <Link href="/production/history" className="text-primary hover:underline">Log Hasil</Link>
          <Link href="/production/resources" className="text-primary hover:underline">Tim / Shift</Link>
        </div>
      </div>

      <DailyProductionDashboard
        orders={serializeData(orders) as unknown as Order[]}
        boms={serializeData(boms) as unknown as Bom[]}
        machines={serializeData(machines) as unknown as Machine[]}
        userId={session?.user?.id}
      />
    </div>
  );
}
