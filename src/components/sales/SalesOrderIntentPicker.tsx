"use client";

import Link from "next/link";
import { Package, Factory, Wrench } from "lucide-react";
import { salesLabels } from "@/lib/labels";

const INTENTS = [
  {
    key: "stock",
    orderType: "MAKE_TO_STOCK",
    icon: Package,
    title: salesLabels.fulfillFromStock,
    desc: "Barang sudah ada di gudang",
    sub: "Kirim dari stok siap",
  },
  {
    key: "produce",
    orderType: "MAKE_TO_ORDER",
    icon: Factory,
    title: salesLabels.fulfillProduce,
    desc: "Butuh WO/produksi sebelum kirim",
    sub: "Lalu kirim ke customer",
  },
  {
    key: "maklon",
    orderType: "MAKLON_JASA",
    icon: Wrench,
    title: salesLabels.fulfillMaklon,
    desc: "Tagih jasa, bukan stok FG",
    sub: "Bahan titipan",
  },
] as const;

export function SalesOrderIntentPicker() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Pesanan Baru</h1>
        <p className="text-muted-foreground mt-1">Apa yang ingin dicatat?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {INTENTS.map((intent) => {
          const Icon = intent.icon;
          return (
            <Link
              key={intent.key}
              href={`/sales/orders/create?intent=${intent.key}`}
              className="group flex flex-col rounded-xl border bg-card p-5 text-left transition-all hover:border-foreground/20 hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              <h3 className="font-semibold text-base">{intent.sub}</h3>
              <p className="text-sm text-muted-foreground mt-1">{intent.title} — {intent.desc}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
        <p>
          Butuh build stok internal tanpa customer?{" "}
          <Link
            href="/production/orders/create"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            Buat Production Order
          </Link>{" "}
          di modul Production (bukan Sales Order).
        </p>
      </div>
    </div>
  );
}
