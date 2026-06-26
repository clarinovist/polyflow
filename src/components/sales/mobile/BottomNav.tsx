"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, ShoppingBag, Package } from "lucide-react";
import { cn } from "@/lib/utils/utils";

const tabs = [
  { href: "/sales/mobile", label: "Beranda", icon: Home },
  { href: "/sales/mobile/customers", label: "Customer", icon: Users },
  { href: "/sales/mobile/orders/create", label: "Order", icon: ShoppingBag },
  { href: "/sales/mobile/stock", label: "Stok", icon: Package },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
      <div className="grid grid-cols-4 h-16">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/sales/mobile"
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-xs transition-colors",
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
