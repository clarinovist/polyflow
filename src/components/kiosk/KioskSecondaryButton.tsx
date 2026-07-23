import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";

export function KioskSecondaryButton({ className, children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-12 md:h-14 text-sm md:text-base font-bold border-2 active:scale-95 transition-all",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
