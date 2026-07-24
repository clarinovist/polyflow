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
  IdCard,
  BookOpen,
  AlertTriangle,
  MessageCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/utils";
import { signOut } from "next-auth/react";
import PolyFlowLogo from "@/components/auth/polyflow-logo";
import { useTheme } from "@/components/layout/theme-provider";
import { useState, useEffect } from "react";
import { mainNavLabels } from "@/lib/labels";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SidebarNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    image?: string | null;
    avatarUrl?: string | null;
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

const sidebarLinkGroups: SidebarLinkGroup[] = [
  {
    heading: "Modul",
    items: [
      { title: mainNavLabels.sales, href: "/sales", icon: ShoppingCart },
      { title: mainNavLabels.purchasing, href: "/purchasing", icon: Truck },
      { title: mainNavLabels.production, href: "/production", icon: Factory },
      { title: mainNavLabels.inventory, href: "/warehouse", icon: PackageSearch },
      { title: mainNavLabels.accounting, href: "/finance", icon: Calculator },
      { title: mainNavLabels.hrd, href: "/hrd", icon: IdCard },
      { title: mainNavLabels.maklon, href: "/maklon", icon: Package },
    ],
  },
  {
    heading: "Master Data",
    items: [
      { title: mainNavLabels.productCatalog, href: "/dashboard/products", icon: Package },
      { title: mainNavLabels.boms, href: "/dashboard/boms", icon: Files },
      { title: mainNavLabels.machines, href: "/dashboard/machines", icon: Settings2 },
      { title: mainNavLabels.employees, href: "/dashboard/employees", icon: Users },
    ],
  },
];

export const sidebarLinks: NavItemType[] = sidebarLinkGroups.flatMap((g) => g.items);

const HELP_CHILDREN: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/support', label: 'Cara pakai', icon: BookOpen },
  { href: '/support/troubleshooting', label: 'Troubleshooting', icon: AlertTriangle },
  { href: '/support/cs', label: 'Tanya Virtual CS', icon: MessageCircle },
];

function isSupportActive(pathname: string) {
  return pathname.startsWith('/support');
}

export function SidebarNav({ user, permissions }: SidebarNavProps) {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isCollapsed, toggle: toggleCollapse } = useSidebarCollapse();
  const [helpOpen, setHelpOpen] = useState(() => isSupportActive(pathname));

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (isMobileOpen) setIsMobileOpen(false);
  }

  useEffect(() => {
    if (isSupportActive(pathname)) setHelpOpen(true);
  }, [pathname]);

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
      ? resolvedTheme === "dark" ? Moon : Sun
      : theme === "dark" ? Moon : Sun;

  const filteredGroups = sidebarLinkGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (permissions === "ALL") return true;
        return permissions.some(
          (p) => p === item.href || p.startsWith(`${item.href}/`) || item.href.startsWith(`${p}/`),
        );
      }),
    }))
    .filter((group) => group.items.length > 0);

  const helpActive = isSupportActive(pathname);

  return (
    <>
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

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:translate-x-0",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className={cn("flex h-16 items-center border-b border-sidebar-border justify-between", isCollapsed ? "px-3" : "px-6")}>
            <Link href="/dashboard">
              {isCollapsed ? <PolyFlowLogo showText={false} size="sm" /> : <PolyFlowLogo showText={true} size="md" />}
            </Link>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-1 text-muted-foreground hover:text-primary transition-colors"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="hidden lg:flex justify-end px-2 pt-2">
            <button
              onClick={toggleCollapse}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {!isCollapsed && (
            <div className="px-4 pt-4">
              <GlobalSearch className="w-full justify-start pl-2" />
            </div>
          )}

          <nav className={cn("flex-1 overflow-y-auto space-y-6 custom-scrollbar", isCollapsed ? "px-2 py-4" : "p-4")}>
            {isCollapsed
              ? filteredGroups.flatMap((group) => group.items).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.title}
                    className={cn(
                      "flex items-center justify-center rounded-lg py-2 transition-colors mx-1",
                      pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href)) ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
                  </Link>
                ))
              : filteredGroups.map((group) => (
                  <div key={group.heading} className="space-y-1">
                    <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{group.heading}</h3>
                    {group.items.map((item) => (
                      <NavItem key={item.href} href={item.href} icon={item.icon} label={item.title} pathname={pathname} />
                    ))}
                  </div>
                ))}

            {/* Help / Bantuan - expandable 3 children */}
            {isCollapsed ? (
              <div className="px-2 pt-2">
                <Link
                  href="/support"
                  title={mainNavLabels.help}
                  className={cn(
                    "flex items-center justify-center rounded-lg py-2 transition-colors mx-1",
                    helpActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <MessageCircleHeart className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="pt-4 space-y-1">
                <button
                  onClick={() => setHelpOpen((o) => !o)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                    helpActive ? "bg-sidebar-accent/60 text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <MessageCircleHeart className="h-4 w-4 text-muted-foreground" />
                    {mainNavLabels.help}
                  </span>
                  {helpOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>

                {helpOpen && (
                  <div className="ml-3 space-y-0.5 border-l border-sidebar-border pl-2">
                    {HELP_CHILDREN.map((child) => {
                      const rootActive = pathname === '/support' || (!!pathname.match(/^\/support\/[^/]+$/) && !pathname.startsWith('/support/troubleshooting') && !pathname.startsWith('/support/cs'));
                      const active = child.href === '/support' ? rootActive : pathname === child.href || pathname.startsWith(child.href + '/');
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                            active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40",
                          )}
                        >
                          <child.icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className={cn("flex items-center rounded-lg bg-sidebar-accent/50 border border-sidebar-border", isCollapsed ? "justify-center p-2" : "gap-3 p-3")}>
              <Avatar className="h-9 w-9 shrink-0">
                {(user.image || user.avatarUrl) && <AvatarImage src={(user.image || user.avatarUrl)!} alt={user.name || "User"} className="object-cover" />}
                <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm text-white">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden min-w-0">
                  <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name || "User"}</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">{user.role || "Warehouse"}</p>
                </div>
              )}
              {!isCollapsed && (
                <>
                  <Link href="/dashboard/settings" className="text-muted-foreground hover:text-primary transition-colors p-1" title="Settings" aria-label="Settings">
                    <Settings className="h-4 w-4" />
                  </Link>
                  <button onClick={cycleTheme} className="text-muted-foreground hover:text-primary transition-colors p-1" title={`Theme: ${getThemeLabel()}`} aria-label="Toggle theme">
                    <ThemeIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-muted-foreground hover:text-red-500 transition-colors p-1" title="Logout" aria-label="Sign out">
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="h-16 lg:hidden" />
    </>
  );
}

function NavItem({ href, icon: Icon, label, pathname }: { href: string; icon: LucideIcon; label: string; pathname: string }) {
  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
      <span>{label}</span>
    </Link>
  );
}
