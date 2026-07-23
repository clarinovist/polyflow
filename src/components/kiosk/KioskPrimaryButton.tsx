import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";

export function KioskPrimaryButton({ className, children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        "h-14 md:h-16 text-base md:text-lg font-bold active:scale-95 transition-all",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
