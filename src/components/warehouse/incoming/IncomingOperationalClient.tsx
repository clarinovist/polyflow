"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Truck,
  FileText,
  History,
  PackageSearch,
  ArrowRight,
  Building2,
  Calendar,
  ShoppingCart,
} from "lucide-react";
import { getStatusLabel } from "@/lib/labels";
import { isWalkInPurchaseOrderNotes } from "@/lib/purchasing/walk-in";

type ReceivablePO = {
  id: string;
  orderNumber: string;
  orderDate: Date | string;
  expectedDate: Date | string | null;
  status: string;
  notes?: string | null;
  supplier: { name: string; code: string | null };
  items: {
    id: string;
    quantity: number;
    receivedQty: number;
    productVariant: {
      name: string;
      skuCode: string;
      primaryUnit: string;
    };
  }[];
  _count: { items: number };
};

type TodayGR = {
  id: string;
  receiptNumber: string;
  receivedDate: Date | string;
  notes?: string | null;
  purchaseOrder: {
    id: string;
    orderNumber: string;
    notes?: string | null;
    supplier: { name: string };
  } | null;
};

export function IncomingOperationalClient({
  receivablePOs,
  todayReceipts,
}: {
  receivablePOs: ReceivablePO[];
  todayReceipts: TodayGR[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Penerimaan Barang
          </h1>
          <p className="text-muted-foreground">
            Lihat antrean &amp; catat barang masuk dari supplier.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/warehouse/incoming/from-nota" passHref>
            <Button
              className="h-9 shrink-0 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileText className="h-4 w-4" /> Terima dari Nota
            </Button>
          </Link>
          <Link href="/warehouse/incoming/history" passHref>
            <Button variant="outline" className="h-9 shrink-0 gap-2">
              <History className="h-4 w-4" /> Riwayat
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-500" /> Menunggu Diterima
              </CardTitle>
              <CardDescription>
                PO yang sudah dikirim (SENT / partial) dan menunggu penerimaan
                di gudang.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {receivablePOs.length} PO
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {receivablePOs.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground font-medium">
                Tidak ada PO menunggu.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Barang datang tanpa PO?{" "}
                <Link
                  href="/warehouse/incoming/from-nota"
                  className="text-emerald-600 hover:underline font-medium"
                >
                  Terima dari Nota
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {receivablePOs.map((po) => {
                const totalRemaining = po.items.reduce(
                  (sum, item) =>
                    sum +
                    (Number(item.quantity) - Number(item.receivedQty)),
                  0,
                );
                const isPartial = po.status === "PARTIAL_RECEIVED";
                const isWalkIn = isWalkInPurchaseOrderNotes(po.notes);
                return (
                  <div
                    key={po.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">
                          {po.orderNumber}
                        </span>
                        <Badge
                          variant={isPartial ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {getStatusLabel(po.status, "purchasing")}
                        </Badge>
                        {isWalkIn && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-500/30 text-amber-700 bg-amber-500/10"
                          >
                            Dari Nota
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {po.supplier.name}
                        </span>
                        <span>{po._count.items} item</span>
                        {isPartial && (
                          <span className="text-amber-600">
                            sisa {totalRemaining}
                          </span>
                        )}
                      </div>
                      {po.expectedDate && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" /> Estimasi:{" "}
                          {format(new Date(po.expectedDate), "dd MMM yyyy")}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/warehouse/incoming/create-receipt?poId=${po.id}`}
                      passHref
                    >
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1"
                      >
                        {isPartial ? "Terima Sisa" : "Terima"}{" "}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {todayReceipts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-muted-foreground" />{" "}
              Diterima Hari Ini
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayReceipts.map((gr) => (
                <Link
                  key={gr.id}
                  href={`/warehouse/incoming/${gr.id}`}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-sm font-medium text-emerald-600">
                      {gr.receiptNumber}
                    </span>
                    {gr.purchaseOrder && (
                      <span className="text-sm text-muted-foreground">
                        {gr.purchaseOrder.orderNumber} —{" "}
                        {gr.purchaseOrder.supplier.name}
                      </span>
                    )}
                    {isWalkInPurchaseOrderNotes(gr.purchaseOrder?.notes) && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-amber-500/30 text-amber-700 bg-amber-500/10"
                      >
                        Dari Nota
                      </Badge>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
