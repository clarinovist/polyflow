"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils/utils";

type SortDirection = "asc" | "desc" | false;

interface DataTableSortIconProps {
  direction: SortDirection;
  className?: string;
}

export function DataTableSortIcon({
  direction,
  className,
}: DataTableSortIconProps) {
  if (direction === false) {
    return (
      <ChevronsUpDown
        className={cn("h-4 w-4 text-muted-foreground/30", className)}
      />
    );
  }

  return direction === "asc" ? (
    <ArrowUp
      className={cn("h-4 w-4 text-blue-600 dark:text-blue-400", className)}
    />
  ) : (
    <ArrowDown
      className={cn("h-4 w-4 text-blue-600 dark:text-blue-400", className)}
    />
  );
}
