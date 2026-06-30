"use client";

import { GlobalSearch } from "@/components/layout/GlobalSearch";
import {
  Factory,
  Package,
  Files,
  Settings2,
  Users,
  Settings,
  LogOut,
  Moon,
  Sun,
  LucideIcon,
  Truck,
  ShoppingCart,
  Calculator,
  Menu,
  X,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  MessageCircleHeart,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/utils";
import { signOut } from "next-auth/react";
import PolyFlowLogo from "@/components/auth/polyflow-logo";
import { useTheme } from "@/components/layout/theme-provider";
import { useState } from "react";
import { mainNavLabels } from "@/lib/labels";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse-context";

interface SidebarNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  permissions: string[] | "ALL";
}

interface NavItemType {
  title: string;
  href: string;
  icon: LucideIcon;
}

interface SidebarLinkGroup {
  heading: string;
  items: NavItemType[];
}

// Grouped sidebar links
const sidebarLinkGroups: SidebarLinkGroup[] = [
  {
    heading: "Modul",
    items: [
      { title: mainNavLabels.sales, href: "/sales", icon: ShoppingCart },
      { title: mainNavLabels.purchasing, href: "/purchasing", icon: Truck },
      { title: mainNavLabels.production, href: "/production", icon: Factory },
      {
        title: mainNavLabels.inventory,
        href: "/warehouse",
        icon: PackageSearch,
      },
      { title: mainNavLabels.accounting, href: "/finance", icon: Calculator },
    ],
  },
  {
    heading: "Master Data",
    items: [
      {
        title: mainNavLabels.productCatalog,
        href: "/dashboard/products",
        icon: Package,
      },
      { title: mainNavLabels.boms, href: "/dashboard/boms", icon: Files },
      {
        title: mainNavLabels.machines,
        href: "/dashboard/machines",
        icon: Settings2,
      },
      {
        title: mainNavLabels.employees,
        href: "/dashboard/employees",
        icon: Users,
      },
    ],
  },
  {
    heading: "Maklon",
    items: [
      {
        title: mainNavLabels.maklonReceipts,
        href: "/dashboard/maklon/receipts",
        icon: PackageSearch,
      },
      {
        title: mainNavLabels.maklonReturns,
        href: "/dashboard/maklon/returns",
        icon: Package,
      },
    ],
  },
];

// Flat export for AccessControlTab permission grid
export const sidebarLinks: NavItemType[] = sidebarLinkGroups.flatMap(
  (g) => g.items,
);

export function SidebarNav({ user, permissions }: SidebarNavProps) {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isCollapsed, toggle: toggleCollapse } = useSidebarCollapse();

  // Close mobile sidebar on navigation
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  }

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const getThemeLabel = () => {
    if (theme === "system") return "System";
    return theme === "light" ? "Light" : "Dark";
  };

  const ThemeIcon =
    theme === "system"
      ? resolvedTheme === "dark"
        ? Moon
        : Sun
      : theme === "dark"
        ? Moon
        : Sun;

  const filteredGroups = sidebarLinkGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (permissions === "ALL") return true;
        return permissions.includes(item.href);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-sidebar-border bg-sidebar px-4 flex items-center">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 -ml-2 mr-2 text-muted-foreground hover:text-primary transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Link href="/dashboard">
          <PolyFlowLogo showText={true} size="sm" />
        </Link>
      </header>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Aside */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:translate-x-0",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo & Close Button (Mobile) */}
          <div
            className={cn(
              "flex h-16 items-center border-b border-sidebar-border justify-between",
              isCollapsed ? "px-3" : "px-6",
            )}
          >
            <Link href="/dashboard">
              {isCollapsed ? (
                <PolyFlowLogo showText={false} size="sm" />
              ) : (
                <PolyFlowLogo showText={true} size="md" />
              )}
            </Link>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-1 text-muted-foreground hover:text-primary transition-colors"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Collapse Toggle (desktop only) */}
          <div className="hidden lg:flex justify-end px-2 pt-2">
            <button
              onClick={toggleCollapse}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Search (hidden when collapsed) */}
          {!isCollapsed && (
            <div className="px-4 pt-4">
              <GlobalSearch className="w-full justify-start pl-2" />
            </div>
          )}

          {/* Navigation */}
          <nav
            className={cn(
              "flex-1 overflow-y-auto space-y-6 custom-scrollbar",
              isCollapsed ? "px-2 py-4" : "p-4",
            )}
          >
            {isCollapsed
              ? // Collapsed: icon-only, no headings
                filteredGroups
                  .flatMap((group) => group.items)
                  .map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.title}
                      className={cn(
                        "flex items-center justify-center rounded-lg py-2 transition-colors mx-1",
                        pathname === item.href ||
                          (item.href !== "/dashboard" &&
                            pathname.startsWith(item.href))
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4",
                          pathname === item.href ||
                            (item.href !== "/dashboard" &&
                              pathname.startsWith(item.href))
                            ? "text-sidebar-accent-foreground"
                            : "text-muted-foreground",
                        )}
                      />
                    </Link>
                  ))
              : // Expanded: grouped with headings
                filteredGroups.map((group) => (
                  <div key={group.heading} className="space-y-1">
                    <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group.heading}
                    </h3>
                    {group.items.map((item) => (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        label={item.title}
                        pathname={pathname}
                      />
                    ))}
                  </div>
                ))}

            {/* Help Link */}
            <div className={isCollapsed ? "px-2 pt-2" : "pt-4"}>
              <Link
                href="/support"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                  "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
                title={mainNavLabels.help}
              >
                <MessageCircleHeart className="h-4 w-4 text-muted-foreground" />
                {!isCollapsed && <span>{mainNavLabels.help}</span>}
              </Link>
            </div>
          </nav>

          {/* User Section */}
          <div className="border-t border-sidebar-border p-3">
            <div
              className={cn(
                "flex items-center rounded-lg bg-sidebar-accent/50 border border-sidebar-border",
                isCollapsed ? "justify-center p-2" : "gap-3 p-3",
              )}
            >
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0 font-medium text-sm text-white">
                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden min-w-0">
                  <p className="text-sm font-semibold text-sidebar-foreground truncate">
                    {user.name || "User"}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">
                    {user.role || "Warehouse"}
                  </p>
                </div>
              )}
              {!isCollapsed && (
                <>
                  <Link
                    href="/dashboard/settings"
                    className="text-muted-foreground hover:text-primary transition-colors p-1"
                    title="Settings"
                    aria-label="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={cycleTheme}
                    className="text-muted-foreground hover:text-primary transition-colors p-1"
                    title={`Theme: ${getThemeLabel()}`}
                    aria-label="Toggle theme"
                  >
                    <ThemeIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                    title="Logout"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Spacer for Mobile Header */}
      <div className="h-16 lg:hidden" />
    </>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  pathname,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  pathname: string;
}) {
  const isActive =
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground",
        )}
      />
      <span>{label}</span>
    </Link>
  );
}
