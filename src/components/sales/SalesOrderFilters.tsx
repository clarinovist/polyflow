"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { salesLabels } from "@/lib/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Dikonfirmasi" },
  { value: "IN_PRODUCTION", label: "Produksi" },
  { value: "READY_TO_SHIP", label: "Siap kirim" },
  { value: "SHIPPED", label: "Dikirim" },
  { value: "DELIVERED", label: "Terkirim" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

const FULFILL_OPTIONS = [
  { value: "stock", label: salesLabels.fulfillFromStock },
  { value: "produce", label: salesLabels.fulfillProduce },
  { value: "maklon", label: salesLabels.fulfillMaklon },
];

const PAYMENT_OPTIONS = [
  { value: "outstanding", label: "Belum lunas" },
  { value: "paid", label: "Lunas" },
  { value: "no_invoice", label: "Belum invoice" },
];

export function SalesOrderFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get("status") || "";
  const currentFulfill = searchParams.get("fulfill") || "";
  const currentPayment = searchParams.get("payment") || "";

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/sales/orders?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Select
        value={currentStatus}
        onValueChange={(v) => updateFilter("status", v === currentStatus ? "" : v)}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentFulfill}
        onValueChange={(v) => updateFilter("fulfill", v === currentFulfill ? "" : v)}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Cara penuhi" />
        </SelectTrigger>
        <SelectContent>
          {FULFILL_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentPayment}
        onValueChange={(v) => updateFilter("payment", v === currentPayment ? "" : v)}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Pembayaran" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
