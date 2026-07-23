"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Truck, Package } from "lucide-react";
import { cn } from "@/lib/utils/utils";

const tabs = [
  { href: "/warehouse/mobile", label: "Beranda", icon: Home },
  { href: "/warehouse/mobile/outgoing", label: "Muat", icon: Truck },
  { href: "/warehouse/mobile/incoming", label: "Terima", icon: Package },
];

export function WarehouseBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/warehouse/mobile"
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground active:text-primary",
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
