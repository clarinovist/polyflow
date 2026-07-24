"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, ShoppingBag, Package, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import { canSeeNavHref } from "@/lib/auth/permission-match";

const tabs = [
  { href: "/field/sales", label: "Beranda", icon: Home, badgeKey: "home" as const },
  { href: "/field/sales/customers", label: "Customer", icon: Users, badgeKey: "customers" as const },
  { href: "/field/sales/orders", label: "Order", icon: ClipboardList, badgeKey: "orders" as const },
  { href: "/field/sales/orders/create", label: "Baru", icon: ShoppingBag, badgeKey: "create" as const },
  { href: "/field/sales/stock", label: "Stok", icon: Package, resource: "/warehouse/inventory", badgeKey: "stock" as const },
];

type BadgeKey = (typeof tabs)[number]["badgeKey"];

interface FieldBottomNavProps {
  permissions?: string[] | "ALL";
  badges?: Partial<Record<BadgeKey, number>>;
}

export function FieldBottomNav({ permissions, badges }: FieldBottomNavProps) {
  const pathname = usePathname();

  const visibleTabs = tabs.filter((tab) =>
    canSeeNavHref(tab.resource ?? tab.href, permissions, tab.resource ? "/warehouse" : "/sales"),
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
        {visibleTabs.map((tab) => {
          const isActive =
            tab.href === "/field/sales"
              ? pathname === tab.href
              : tab.href === "/field/sales/orders"
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
          const badgeCount = badges?.[tab.badgeKey];
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
              <span className="relative">
                <tab.icon className="h-5 w-5" />
                {!!badgeCount && badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
