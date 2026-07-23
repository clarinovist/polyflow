import { cn } from "@/lib/utils/utils";

interface KioskOperatorChipProps {
  name: string;
  initials?: string;
  machineNames?: string[];
  className?: string;
}

export function KioskOperatorChip({ name, initials, machineNames, className }: KioskOperatorChipProps) {
  const displayInitials = initials || name.charAt(0).toUpperCase();

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-md uppercase shrink-0">
        {displayInitials}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-tight">
          Operator Aktif
        </span>
        <span className="text-sm font-black uppercase tracking-tight truncate">{name}</span>
        {machineNames && machineNames.length > 0 && (
          <span className="text-xs text-emerald-600 font-medium truncate">
            {machineNames.join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}
