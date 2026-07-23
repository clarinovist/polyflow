import { Badge } from "@/components/ui/badge";
import { getStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils/utils";

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  WAITING_MATERIAL: "outline",
  RELEASED: "outline",
  IN_PROGRESS: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

/** Extra classes so Menunggu Bahan is visually distinct from Siap Produksi */
const STATUS_CLASS: Record<string, string> = {
  WAITING_MATERIAL:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  RELEASED:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-400",
  IN_PROGRESS:
    "bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200",
  COMPLETED:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

export function ProductionStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={STATUS_VARIANTS[status] ?? "secondary"}
      className={cn("shadow-none font-medium", STATUS_CLASS[status])}
    >
      {getStatusLabel(status, "production")}
    </Badge>
  );
}
