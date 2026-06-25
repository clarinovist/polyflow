"use client";

import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_TERMS } from "@/lib/constants/payment-terms";

interface PaymentTermSelectProps {
  value: number;
  onChange: (days: number) => void;
  label?: string;
  defaultFromEntity?: number | null;
}

export function PaymentTermSelect({
  value,
  onChange,
  label = "Termin Pembayaran",
  defaultFromEntity,
}: PaymentTermSelectProps) {
  const [customInput, setCustomInput] = useState(value.toString());

  const isPreset = useMemo(
    () => PAYMENT_TERMS.some((t) => t.value === value && t.value !== -1),
    [value],
  );
  const isCustom = !isPreset && value >= 0;

  const handleSelectChange = (selected: string) => {
    const numValue = Number(selected);
    if (numValue === -1) {
      const fallback = defaultFromEntity ?? 30;
      setCustomInput(fallback.toString());
      onChange(fallback);
    } else {
      onChange(numValue);
    }
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setCustomInput(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 0) {
      onChange(num);
    }
  };

  const currentSelectValue = isCustom
    ? "-1"
    : isPreset
      ? value.toString()
      : "-1";

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={currentSelectValue} onValueChange={handleSelectChange}>
        <SelectTrigger>
          <SelectValue placeholder="Pilih termin" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_TERMS.map((term) => (
            <SelectItem key={term.value} value={term.value.toString()}>
              {term.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCustom && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={customInput}
            onChange={handleCustomChange}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">hari</span>
        </div>
      )}
    </div>
  );
}
