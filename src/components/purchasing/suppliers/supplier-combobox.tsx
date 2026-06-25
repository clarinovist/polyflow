"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";

import { cn } from "@/lib/utils/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SupplierOption {
  id: string;
  name: string;
  code: string | null;
}

interface SupplierComboboxProps {
  suppliers: SupplierOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SupplierCombobox({
  suppliers,
  value,
  onValueChange,
  placeholder = "Pilih supplier...",
  disabled = false,
  className,
}: SupplierComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedSupplier = suppliers.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal min-w-0 h-11",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {selectedSupplier ? (
            <span className="flex items-center gap-2 truncate min-w-0">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-left">
                {selectedSupplier.name}
              </span>
              {selectedSupplier.code && (
                <span className="text-muted-foreground text-[10px] shrink-0 font-mono">
                  [{selectedSupplier.code}]
                </span>
              )}
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          filter={(val, search) => {
            const supplier = suppliers.find((s) => s.id === val);
            if (!supplier) return 0;
            const q = search.toLowerCase();
            return supplier.name.toLowerCase().includes(q) ||
              (supplier.code && supplier.code.toLowerCase().includes(q))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder="Cari supplier..." />
          <CommandList>
            <CommandEmpty>Tidak ada supplier ditemukan.</CommandEmpty>
            <CommandGroup>
              {suppliers.map((supplier) => (
                <CommandItem
                  key={supplier.id}
                  value={supplier.id}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === supplier.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate font-medium">
                      {supplier.name}
                    </span>
                    {supplier.code && (
                      <span className="text-xs text-muted-foreground">
                        {supplier.code}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
