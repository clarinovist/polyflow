"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Factory,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { QuickProduceDialog } from "./QuickProduceDialog";

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  plannedQuantity: number;
  actualQuantity: number | null;
  plannedStartDate: string;
  notes: string | null;
  bom: {
    id: string;
    name: string;
    category: string;
    productVariant: {
      id: string;
      name: string;
      primaryUnit: string | null;
    };
  };
  machine: {
    id: string;
    name: string;
    code: string;
  } | null;
  executions: Array<{
    id: string;
    quantityProduced: number;
    scrapQuantity: number;
    startTime: string;
    endTime: string | null;
    status: string;
  }>;
  plannedMaterials: Array<{
    id: string;
    productVariantId: string;
    quantity: number;
  }>;
};

export type Bom = {
  id: string;
  name: string;
  category: string;
  productVariant: {
    id: string;
    name: string;
    product: {
      name: string;
    };
  };
};

export type Machine = {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
    icon: React.ElementType;
  }
> = {
  RELEASED: { label: "Siap Produksi", variant: "outline", icon: Clock },
  IN_PROGRESS: { label: "Sedang Jalan", variant: "default", icon: Factory },
  WAITING_MATERIAL: {
    label: "Tunggu Bahan",
    variant: "destructive",
    icon: AlertCircle,
  },
  COMPLETED: { label: "Selesai", variant: "secondary", icon: CheckCircle2 },
  DRAFT: { label: "Draft", variant: "secondary", icon: Clock },
};

export function DailyProductionDashboard({
  orders,
  boms,
  machines,
  stats,
}: {
  orders: Order[];
  boms: Bom[];
  machines: Machine[];
  stats: { total: number; running: number; released: number; waiting: number };
  userId?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Produk</CardTitle>
            <Factory className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produk hari ini
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sedang Jalan</CardTitle>
            <Factory className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.running}</div>
            <p className="text-xs text-muted-foreground mt-1">Produksi aktif</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Siap Produksi</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.released}</div>
            <p className="text-xs text-muted-foreground mt-1">Menunggu mulai</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tunggu Bahan</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.waiting}</div>
            <p className="text-xs text-muted-foreground mt-1">Stok kurang</p>
          </CardContent>
        </Card>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Daftar Produksi
        </h2>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Produk
        </Button>
      </div>

      {/* Order cards */}
      {orders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Factory className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">
              Belum ada produksi hari ini
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
              Klik &quot;Tambah Produk&quot; untuk memulai produksi harian.
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              variant="outline"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Tambah Produk Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {/* Quick Produce Dialog */}
      <QuickProduceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        boms={boms}
        machines={machines}
      />
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const progress =
    order.plannedQuantity > 0
      ? Math.min(
          ((Number(order.actualQuantity) || 0) /
            Number(order.plannedQuantity)) *
            100,
          100,
        )
      : 0;

  const totalOutput = (order.executions ?? []).reduce(
    (sum, ex) => sum + Number(ex.quantityProduced),
    0,
  );
  const totalScrap = (order.executions ?? []).reduce(
    (sum, ex) => sum + Number(ex.scrapQuantity),
    0,
  );

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.DRAFT;
  const StatusIcon = statusConfig.icon;

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold truncate">
              {order.bom.productVariant.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {order.bom.category} • {order.bom.name}
            </p>
          </div>
          <Badge variant={statusConfig.variant} className="ml-2 shrink-0 gap-1">
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Machine */}
        {order.machine && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mesin:</span>
            <span className="font-medium">{order.machine.code}</span>
          </div>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Output</span>
            <span className="font-medium">
              {Number(order.actualQuantity || 0).toLocaleString("id-ID")} /{" "}
              {Number(order.plannedQuantity).toLocaleString("id-ID")}{" "}
              {order.bom.productVariant.primaryUnit || ""}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Execution stats */}
        {(order.executions ?? []).length > 0 && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{(order.executions ?? []).length} eksekusi</span>
            <span>Output: {totalOutput.toLocaleString("id-ID")}</span>
            {totalScrap > 0 && (
              <span className="text-red-500">
                Scrap: {totalScrap.toLocaleString("id-ID")}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Link href={`/production/orders/${order.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Detail
            </Button>
          </Link>
          <Link href="/kiosk" className="flex-1">
            <Button variant="secondary" size="sm" className="w-full gap-1.5">
              <Factory className="h-3.5 w-3.5" />
              Kiosk
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
