import { cn } from "@/lib/utils/utils";

interface KioskStepHeaderProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
}

export function KioskStepHeader({ currentStep, totalSteps, title, subtitle }: KioskStepHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {currentStep}/{totalSteps}
        </span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < currentStep ? "bg-primary" : i === currentStep - 1 ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <div>
        <h2 className="text-xl md:text-2xl font-black tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
