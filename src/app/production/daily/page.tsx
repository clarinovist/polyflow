import { auth } from "@/auth";
import { prisma } from "@/lib/core/prisma";
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
  const orders = await prisma.productionOrder.findMany({
    where: {
      plannedStartDate: {
        gte: today,
        lt: tomorrow,
      },
      status: {
        in: [
          ProductionStatus.RELEASED,
          ProductionStatus.IN_PROGRESS,
          ProductionStatus.WAITING_MATERIAL,
        ],
      },
    },
    include: {
      bom: {
        include: {
          productVariant: true,
        },
      },
      machine: true,
      executions: {
        orderBy: { startTime: "desc" },
      },
      plannedMaterials: {
        include: {
          productVariant: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch BOMs with default flag for Quick Produce dialog
  const boms = await prisma.bom.findMany({
    where: { isDefault: true },
    include: {
      productVariant: {
        include: { product: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // Fetch active machines
  const machines = await prisma.machine.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

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
