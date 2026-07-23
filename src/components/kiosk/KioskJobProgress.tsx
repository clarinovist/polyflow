import { cn } from "@/lib/utils/utils";

interface KioskJobProgressProps {
  actual: number;
  target: number;
  unit?: string;
  className?: string;
}

export function KioskJobProgress({ actual, target, unit = 'unit', className }: KioskJobProgressProps) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  const isComplete = actual >= target && target > 0;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl md:text-4xl font-black tabular-nums">{actual.toLocaleString('id-ID')}</span>
          <span className="text-lg text-muted-foreground font-medium">/ {target.toLocaleString('id-ID')}</span>
        </div>
        <span className="text-sm text-muted-foreground font-medium">{unit}</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isComplete ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
