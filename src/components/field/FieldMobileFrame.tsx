"use client";

import { Monitor } from "lucide-react";

interface FieldMobileFrameProps {
  children: React.ReactNode;
}

export function FieldMobileFrame({ children }: FieldMobileFrameProps) {
  return (
    <div className="hidden lg:flex min-h-screen bg-muted/30 items-start justify-center">
      <div className="w-full max-w-md min-h-screen bg-background shadow-2xl border-x relative">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b text-xs text-muted-foreground sticky top-0 z-40">
          <Monitor className="h-3.5 w-3.5" />
          <span className="font-medium">Portal Operasional Lapangan</span>
          <span className="ml-auto opacity-60">Preview Mode</span>
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
