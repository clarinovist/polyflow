import React from "react";
import { cn } from "@/lib/utils/utils";

interface MobileStickyActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  /**
   * Set true when the page already has a fixed BottomNav (e.g. sales/mobile
   * layout, h-16 + safe-area). Renders this bar above the nav instead of at
   * the screen bottom so buttons aren't covered by the higher z-index nav.
   */
  aboveBottomNav?: boolean;
}

/**
 * Sticky bottom action bar for forms/dialogs on mobile. Hidden on md+ where
 * inline form actions are preferred. Always pair with a spacer (h-16) or
 * padding-bottom on the scrollable content so the bar doesn't cover it.
 */
export function MobileStickyActions({ children, className, aboveBottomNav, ...props }: MobileStickyActionsProps) {
  return (
    <div
      className={cn(
        "md:hidden fixed left-0 right-0 z-40 flex gap-2 border-t bg-background p-3",
        aboveBottomNav
          ? "bottom-[calc(4rem+env(safe-area-inset-bottom))]"
          : "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Spacer to reserve space at the bottom of scrollable content behind MobileStickyActions. */
export function MobileStickyActionsSpacer({ className }: { className?: string }) {
  return <div className={cn("h-16 md:hidden", className)} aria-hidden />;
}
