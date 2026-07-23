import { cn } from "@/lib/utils/utils";

const STEPS = [
  { num: 1, label: "Spesifikasi" },
  { num: 2, label: "Lokasi & meta" },
  { num: 3, label: "Review & buat" },
] as const;

export type StepNumber = 1 | 2 | 3;

interface CreateSpkStepperProps {
  currentStep: StepNumber;
}

export function CreateSpkStepper({ currentStep }: CreateSpkStepperProps) {
  return (
    <nav aria-label="Progress" className="flex items-center gap-0 w-full">
      {STEPS.map((step, i) => {
        const isActive = step.num === currentStep;
        const isCompleted = step.num < currentStep;
        return (
          <div key={step.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isCompleted && "bg-primary/20 text-primary",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground",
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {step.num}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden sm:inline",
                  isActive && "text-foreground",
                  isCompleted && "text-primary",
                  !isActive && !isCompleted && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-px mx-3",
                  isCompleted ? "bg-primary/30" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
