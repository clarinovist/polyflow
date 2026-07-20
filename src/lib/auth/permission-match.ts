import { getModuleRoot } from "@/lib/auth/permission-catalog";

/**
 * Generic per-portal nav visibility check, extracted from the warehouse
 * sidebar's original `canSeeWarehouseLink` (kept behavior-identical).
 *
 * - `undefined` / `'ALL'` permissions → full menu (role-native / tenant admin).
 * - Full module-root grant (e.g. `/warehouse`) → every link under that module.
 * - Otherwise: exact match, being a child of a granted resource, or being the
 *   parent nav of a granted nested resource (so the group stays reachable).
 */
export function canSeeNavHref(
  href: string,
  permissions: string[] | "ALL" | undefined,
  moduleRoot?: string,
): boolean {
  if (permissions === undefined || permissions === "ALL") return true;

  const root = moduleRoot ?? getModuleRoot(href);
  if (root && permissions.includes(root)) return true;

  return permissions.some(
    (p) =>
      href === p ||
      href.startsWith(`${p}/`) ||
      (p.startsWith(`${href}/`) && href !== root),
  );
}

export interface FilterableNavItem {
  href: string;
  children?: FilterableNavItem[];
}

/** Recursively filters a nav item tree, keeping parents with visible children. */
export function filterNavItems<T extends FilterableNavItem>(
  items: T[],
  permissions: string[] | "ALL" | undefined,
): T[] {
  if (permissions === undefined || permissions === "ALL") return items;

  return items.reduce<T[]>((acc, item) => {
    const visibleChildren = item.children
      ? filterNavItems(item.children as T[], permissions)
      : undefined;
    const selfVisible = canSeeNavHref(item.href, permissions);

    if (selfVisible || (visibleChildren && visibleChildren.length > 0)) {
      acc.push({
        ...item,
        ...(item.children ? { children: visibleChildren } : {}),
      });
    }
    return acc;
  }, []);
}

export interface FilterableNavGroup<T extends FilterableNavItem> {
  heading: string;
  items: T[];
}

/** Filters grouped sidebar links (heading + items), dropping empty groups. */
export function filterNavGroups<
  T extends FilterableNavItem,
  G extends FilterableNavGroup<T>,
>(groups: G[], permissions: string[] | "ALL" | undefined): G[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterNavItems(group.items, permissions),
    }))
    .filter((group) => group.items.length > 0);
}
