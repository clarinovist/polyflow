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

function FilterSelect({
  label,
  paramKey,
  currentValue,
  options,
  locked,
  lockedDisplay,
}: {
  label: string;
  paramKey: string;
  currentValue: string;
  options: { value: string; label: string }[];
  locked?: boolean;
  lockedDisplay?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = useCallback(
    (value: string) => {
      if (locked) return;
      const params = new URLSearchParams(searchParams.toString());
      // "__all__" means clear the filter
      if (value === "__all__" || value === currentValue) {
        params.delete(paramKey);
      } else {
        params.set(paramKey, value);
      }
      router.push(`/sales/orders?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, paramKey, currentValue, locked]
  );

  if (locked) {
    return (
      <div
        className="inline-flex h-8 w-[160px] items-center rounded-md border border-dashed border-border bg-muted/40 px-3 text-xs text-muted-foreground"
        title={`Dikunci oleh quick view: ${lockedDisplay || label}`}
      >
        <span className="truncate">
          {label}: <span className="font-medium text-foreground">{lockedDisplay || "—"}</span>
        </span>
      </div>
    );
  }

  return (
    <Select value={currentValue || "__all__"} onValueChange={handleChange}>
      <SelectTrigger className="w-[160px] h-8 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Semua</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type SalesOrderFilterLocks = {
  status?: boolean;
  fulfill?: boolean;
  payment?: boolean;
  statusDisplay?: string;
  fulfillDisplay?: string;
  paymentDisplay?: string;
};

export function SalesOrderFilters({ locks }: { locks?: SalesOrderFilterLocks }) {
  const searchParams = useSearchParams();

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <FilterSelect
        label="Status"
        paramKey="status"
        currentValue={searchParams.get("status") || ""}
        options={STATUS_OPTIONS}
        locked={locks?.status}
        lockedDisplay={locks?.statusDisplay}
      />
      <FilterSelect
        label="Cara penuhi"
        paramKey="fulfill"
        currentValue={searchParams.get("fulfill") || ""}
        options={FULFILL_OPTIONS}
        locked={locks?.fulfill}
        lockedDisplay={locks?.fulfillDisplay}
      />
      <FilterSelect
        label="Pembayaran"
        paramKey="payment"
        currentValue={searchParams.get("payment") || ""}
        options={PAYMENT_OPTIONS}
        locked={locks?.payment}
        lockedDisplay={locks?.paymentDisplay}
      />
    </div>
  );
}
