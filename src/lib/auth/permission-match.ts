import { getModuleRoot } from '@/lib/auth/permission-catalog';

/**
 * Permission alias map — legacy resource keys that should be treated as
 * equivalent to their canonical counterparts.
 */
const PERMISSION_ALIASES: Record<string, string> = {
    '/sales/mobile': '/field/sales',
};

function resolveAlias(value: string): string {
    const exact = PERMISSION_ALIASES[value];
    if (exact) return exact;
    for (const [alias, canonical] of Object.entries(PERMISSION_ALIASES)) {
        if (value.startsWith(`${alias}/`)) {
            return value.replace(alias, canonical);
        }
    }
    return value;
}

/**
 * Generic per-portal nav visibility check.
 * Permission aliases are resolved before matching (e.g. `/sales/mobile` ↔ `/field/sales`).
 */
export function canSeeNavHref(
    href: string,
    permissions: string[] | 'ALL' | undefined,
    moduleRoot?: string,
): boolean {
    if (permissions === undefined || permissions === 'ALL') return true;

    const root = moduleRoot ?? getModuleRoot(href);
    if (root && permissions.includes(root)) return true;

    const resolvedRoot = resolveAlias(root ?? '');
    if (resolvedRoot !== root && permissions.includes(resolvedRoot)) return true;

    const resolvedHref = resolveAlias(href);

    return permissions.some((p) => {
        const resolvedPermission = resolveAlias(p);
        return (
            resolvedHref === resolvedPermission ||
            resolvedHref.startsWith(`${resolvedPermission}/`) ||
            (resolvedPermission.startsWith(`${resolvedHref}/`) &&
                resolvedHref !== root) ||
            href === p ||
            href.startsWith(`${p}/`) ||
            (p.startsWith(`${href}/`) && href !== root)
        );
    });
}

export interface FilterableNavItem {
    href: string;
    children?: FilterableNavItem[];
}

/** Recursively filters a nav item tree, keeping parents with visible children. */
export function filterNavItems<T extends FilterableNavItem>(
    items: T[],
    permissions: string[] | 'ALL' | undefined,
): T[] {
    if (permissions === undefined || permissions === 'ALL') return items;

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
>(groups: G[], permissions: string[] | 'ALL' | undefined): G[] {
    return groups
        .map((group) => ({
            ...group,
            items: filterNavItems(group.items, permissions),
        }))
        .filter((group) => group.items.length > 0);
}
